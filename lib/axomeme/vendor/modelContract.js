/* VENDORED from veg/datamonkey3 src/lib/services/axomeme/modelContract.js
 * at commit a00d3b72df26e03a9808d3ed87326f118d6f791a.
 * Mechanically converted ESM->CJS (see lib/axomeme/README.md for the exact
 * recipe). Do NOT reformat or "fix" this file by hand -- it is kept diffable
 * against upstream. To update, re-vendor from datamonkey3 and re-apply the
 * conversion.
 */
/**
 * modelContract.js — what the AxoMEME 2.0 ONNX graph accepts and returns.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS CODE RATHER THAN A README.
 *
 * The exported graph is the MODEL ONLY. It takes five already-computed tensors and returns five;
 * the entire preprocessing pipeline that produces those tensors — newick parse, patristic
 * distances, taxon subsampling, codon/AA tokenisation, and the MDS eigendecomposition — is NOT in
 * the graph and has to be rebuilt in JS. `mds_coords` is a graph INPUT, not something the graph
 * computes. (`torch.linalg.eigh` has no ONNX lowering, so this is forced rather than chosen:
 * exporting the identical module with eigh removed succeeds and with it present fails.)
 *
 * That means every number below is a place a JS port can be silently, plausibly wrong — producing
 * a well-formed tensor of the right shape that means something different from what the model was
 * trained on. Several of them are genuinely surprising, so they are constants here with citations
 * rather than assumptions in someone's head:
 *
 *   - CODON ORDER IS "TCAG", NOT ALPHABETICAL. The vocabulary is built as
 *     `[a+b+c for a in "TCAG" for b in "TCAG" for c in "TCAG"]`, the standard genetic-code table
 *     order. An ACGT-ordered vocabulary is a perfectly valid-looking permutation of the same 64
 *     tokens and would be wrong at every site. THE HANDOFF'S OWN INFERENCE DRIVER GETS THIS WRONG —
 *     see the next paragraph before "correcting" anything here to match it.
 *
 * THE DRIVER'S TOKENIZER DISAGREES WITH THE TRAINING TOKENIZER. This is measured, not suspected.
 *
 *   train_transformer_selection.py:74-85  (TRAINING)  64 codons, TCAG order, '-'->64, '?'->65
 *   predict_regression_nexus.py:49-80     (INFERENCE) 60 codons, ALPHABETICAL, everything else ->65
 *
 * The driver defines its own `CODON_LIST` / `CODON_TO_IDX` at lines 49-55, then redefines
 * `get_codon_token` at line 74 — but never redefines `CODON_TO_IDX`, so the winning function looks up
 * the 60-codon alphabetical map. It imports only `PhyloAxialTransformer`,
 * `compute_mds_coordinates` and `decode_soft_ordinal_lrt` from the training module (line 28), so the
 * training tokenizer is never in scope. Result, checked over all 64 codons:
 *
 *   63 of 64 codons receive a DIFFERENT token at inference than at training
 *     ATG: train 35 -> inference 14      TTT: train  0 -> inference 59
 *     AAA: train 42 -> inference  0      GGG: train 63 -> inference 42
 *   TTA (Leucine) and all three stop codons are ABSENT from the driver's list entirely, so they
 *   collapse to 65 "unknown" — real leucine data is discarded rather than mistokenised.
 *   The amino-acid stream is nearly intact: 3 of 64 wrong, the stops, because the driver's
 *   GENETIC_CODE writes them as '_' while AA_LIST contains '*', so they land on 22 instead of 20.
 *
 * DM3 USES THE TRAINING VOCABULARY, which is what this file pins. A model trained on TCAG-64 has to
 * be served TCAG-64; there is no reading under which the driver's map is the right one for these
 * weights. Reproducing the driver here would reproduce a bug.
 *
 * Note what this does NOT invalidate: the ML team's ONNX-vs-PyTorch parity result. That test feeds
 * the same tensors to both sides, so it proves the graph was exported faithfully and is unaffected
 * by which tokenizer produced those tensors. The bug is invisible to it by construction — which is
 * exactly why it survived to here.
 *   - GAP AND UNKNOWN ARE DIFFERENT TOKENS, and they differ between the two streams: codons use
 *     64/65, amino acids use 21/22. They are not interchangeable — `forward()` gates on
 *     `(c_cent < 64) & (a_cent < 21)`, so a gap counts as invalid at the central site.
 *   - MDS IS COMPUTED ON THE PADDED MATRIX. `compute_mds_coordinates` is handed the full
 *     [max_species, max_species] tensor, zeros included, so the padded region participates in the
 *     double-centring and the coordinates depend on max_species — not just on the real taxa. A port
 *     that runs MDS on the N real species and pads afterwards gets different numbers.
 *   - THE THREE PHYLO TENSORS ARE SITE-INVARIANT. dist_matrix, mds_coords and padding_mask are
 *     computed once and `expand`ed across sites. They are per-alignment, not per-site, which is what
 *     makes batching every site into one graph run cheap.
 *
 * Sources, all in the ML team's handoff (axomeme-2.0-viral-handoff/scripts/):
 *   predict_regression_nexus.py:161-187   compute_mds_coordinates
 *   predict_regression_nexus.py:1213-1229 tensor allocation, pad tokens, MDS on the padded matrix
 *   predict_regression_nexus.py:1271-1275 the site-invariant expands
 *   predict_regression_nexus.py:981-982   window_size / max_species defaults
 *   train_transformer_selection.py:73-97  codon + amino acid vocabularies
 *   train_transformer_selection.py:1591   forward(msa_codons, msa_aas, dist_matrix, mds_coords, padding_mask)
 *
 * This module is deliberately a LEAF: it imports nothing, computes nothing, and holds no model. It
 * describes and it validates. Nothing here should ever pull in onnxruntime-web — the runtime is
 * loaded on the AxoMEME path only, and the reachability guard in
 * src/test/meme-hit-likelihood.test.js exists to keep that true.
 */

/** Codon vocabulary order. NOT alphabetical — see the header. */
const CODON_ORDER = 'TCAG';

/** 64 sense+stop codons occupy 0..63; these two are the sentinels. */
const CODON_GAP = 64;
const CODON_UNKNOWN = 65;

/** `num_tokens=66` is passed to the model constructor: 64 codons + gap + unknown. */
const NUM_CODON_TOKENS = 66;

/** Amino acid vocabulary, index = position in this string. */
const AA_LIST = 'ACDEFGHIKLMNPQRSTVWY*-?';
const AA_GAP = 21; // AA_LIST.indexOf('-')
const AA_UNKNOWN = 22; // AA_LIST.indexOf('?')

/**
 * `forward()` treats a species as present at the central site only if
 * `(codon < 64) & (aa < 21) & !padded`. So a gap is NOT a valid observation, and these are the
 * thresholds — not `<= 64` / `<= 21`.
 */
const CODON_VALID_BELOW = 64;
const AA_VALID_BELOW = 21;

/** `--max_species` default. Tensors are padded to exactly this many rows. */
const MAX_SPECIES_DEFAULT = 512;

/**
 * `--window_size` default, and the value this checkpoint was fine-tuned at. The model reads the
 * CENTRAL column (`window_size // 2`), so an even window would shift which codon is scored.
 */
const WINDOW_SIZE_DEFAULT = 1;

/** `compute_mds_coordinates(..., n_components=4)`. */
const MDS_COMPONENTS = 4;

/**
 * `padding_mask` is TRUE for padded rows — the opposite of the "1 = keep" convention used in most
 * attention APIs, and a sign flip here silently masks out every real taxon instead of none.
 */
const PADDING_MASK_TRUE_MEANS_PADDED = true;

/**
 * The five graph inputs, in `forward()` order.
 *
 * `dims` uses the symbolic names the export declares dynamic (batch, num_species); everything else
 * is fixed by the checkpoint. int64 matters: onnxruntime-web wants a BigInt64Array for these, and
 * passing Float32Array of the same values is a type error at session.run, not a silent coercion.
 */
const INPUT_SPEC = Object.freeze([
	Object.freeze({
		name: 'msa_codons',
		dtype: 'int64',
		dims: ['batch', 'num_species', 'window_size'],
		valueRange: [0, CODON_UNKNOWN],
		padValue: CODON_UNKNOWN,
		siteInvariant: false
	}),
	Object.freeze({
		name: 'msa_aas',
		dtype: 'int64',
		dims: ['batch', 'num_species', 'window_size'],
		valueRange: [0, AA_UNKNOWN],
		padValue: AA_UNKNOWN,
		siteInvariant: false
	}),
	Object.freeze({
		name: 'dist_matrix',
		dtype: 'float32',
		dims: ['batch', 'num_species', 'num_species'],
		siteInvariant: true
	}),
	Object.freeze({
		name: 'mds_coords',
		dtype: 'float32',
		dims: ['batch', 'num_species', 'mds_components'],
		siteInvariant: true
	}),
	Object.freeze({
		name: 'padding_mask',
		dtype: 'bool',
		dims: ['batch', 'num_species'],
		siteInvariant: true
	})
]);

/**
 * The five graph outputs, in graph order. RESOLVED against the artifact itself — these names were
 * read out of `InferenceSession.outputNames` on axomeme_2.0_viral_finetuned.onnx
 * (sha256 3e06b591…6faec6), not from documentation.
 *
 * THE EXPORT IS EVAL MODE. This was an open question worth recording, because the shipped driver
 * switches the module to `model.train()` before every forward pass purely to reach the branch that
 * returns RAW ORDINAL LOGITS, so it can apply `--prior_shift` and call `decode_soft_ordinal_lrt`
 * itself (predict_regression_nexus.py:1354-1366). The answer is that the graph took the EVAL branch:
 * five outputs, `lrt` already decoded. Two consequences for the JS side:
 *
 *   - JS does NOT implement `decode_soft_ordinal_lrt`. The graph did it.
 *   - `prior_shift` is baked to 0 and is not reachable. If a calibration shift is ever wanted, it has
 *     to be re-exported, not applied here.
 *
 * STILL OPEN, and it belongs to POSTPROCESSING rather than to this contract: the driver applies
 * `np.expm1` to alpha / beta_neg / beta_pos before writing its CSV. Those heads are `F.softplus(...)`,
 * and expm1(softplus(x)) == exp(x), so the model is predicting log1p(rate) and expm1 recovers the
 * rate — meaning the raw graph outputs are NOT rates and must not be shown as such. `p_neg` is
 * sigmoid in-graph and is already a probability. Whether `lrt` needs a further exp is unresolved: the
 * driver emits both `predicted_log_lrt` and `predicted_lrt` columns, and which one this output
 * corresponds to has to be checked against sample_predictions.csv before anything is rendered.
 */
const OUTPUT_SPEC = Object.freeze([
	Object.freeze({
		name: 'lrt',
		note: 'MEME LRT surrogate, ordinal decode already applied in-graph (eval-mode export)'
	}),
	Object.freeze({ name: 'alpha', note: 'dS as log1p(rate); caller applies expm1' }),
	Object.freeze({ name: 'beta_neg', note: 'as log1p(rate); caller applies expm1' }),
	Object.freeze({ name: 'beta_pos', note: 'dN+ as log1p(rate); caller applies expm1' }),
	Object.freeze({ name: 'p_neg', note: 'already sigmoid in-graph; a probability as-is' })
]);

/**
 * The artifact this contract was verified against. A different export is not necessarily wrong, but
 * it is not this one, and the eval-mode conclusion above was read off THIS graph.
 */
const VERIFIED_MODEL_SHA256 =
	'3e06b591a060fca996a41c040c2c29f319aa47ca3d3401f4757571b57e6faec6';

/** Every input name, in graph order. */
const INPUT_NAMES = Object.freeze(INPUT_SPEC.map((s) => s.name));

/**
 * Check a bundle of prepared tensors against the contract, without running anything.
 *
 * This is the cheap half of parity: it cannot tell you the MDS coordinates are RIGHT — only real
 * fixtures from the Python pipeline can do that — but it catches the whole class of errors that
 * produce a well-formed tensor with the wrong meaning, which is the class a JS port actually
 * generates. Returns every problem it finds rather than throwing on the first, because a port under
 * development usually has several and stopping at one wastes a round trip.
 *
 * @param {Record<string, {data: ArrayLike<number|bigint|boolean>, dims: number[]}>} bundle
 * @param {{batch: number, numSpecies: number, windowSize?: number, mdsComponents?: number}} shape
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateInputBundle(bundle, shape) {
	const errors = [];
	const { batch, numSpecies } = shape;
	const windowSize = shape.windowSize ?? WINDOW_SIZE_DEFAULT;
	const mdsComponents = shape.mdsComponents ?? MDS_COMPONENTS;

	const expected = {
		msa_codons: [batch, numSpecies, windowSize],
		msa_aas: [batch, numSpecies, windowSize],
		dist_matrix: [batch, numSpecies, numSpecies],
		mds_coords: [batch, numSpecies, mdsComponents],
		padding_mask: [batch, numSpecies]
	};

	for (const spec of INPUT_SPEC) {
		const t = bundle[spec.name];
		if (!t) {
			errors.push(`${spec.name}: missing`);
			continue;
		}
		const want = expected[spec.name];
		const got = Array.from(t.dims ?? []);
		if (got.length !== want.length || got.some((d, i) => d !== want[i])) {
			errors.push(`${spec.name}: dims [${got}], expected [${want}]`);
			continue;
		}
		const want_n = want.reduce((a, b) => a * b, 1);
		if (t.data.length !== want_n) {
			errors.push(
				`${spec.name}: ${t.data.length} elements for dims [${want}] (expected ${want_n})`
			);
			continue;
		}
		if (spec.valueRange) {
			const [lo, hi] = spec.valueRange;
			for (let i = 0; i < t.data.length; i++) {
				const v = Number(t.data[i]);
				if (!Number.isInteger(v) || v < lo || v > hi) {
					errors.push(`${spec.name}[${i}] = ${v}, outside ${lo}..${hi}`);
					break;
				}
			}
		}
	}

	// Cross-tensor invariants — the ones that are individually well-formed but jointly wrong.
	const pad = bundle.padding_mask;
	const dist = bundle.dist_matrix;
	if (pad && dist && pad.data.length === batch * numSpecies) {
		// THE MASK-POLARITY CHECK. `padding_mask` is TRUE for padded rows, the opposite of the
		// "1 = keep" convention most attention APIs use, and an inverted mask is well-formed in every
		// other respect — right dtype, right dims, right element count. What gives it away is the
		// DISTANCE MATRIX: padded rows are never written, so they stay all-zero, while real rows
		// carry real distances. Invert the mask and rows holding genuine distances get marked padded.
		//
		// An earlier version of this checked only self-distances and only the all-padded case. It did
		// not fire on a partial flip, which is the flip that actually happens — some rows stay
		// unpadded and every self-distance is legitimately zero either way.
		let flagged = false;
		for (let b = 0; b < batch && !flagged; b++) {
			for (let i = 0; i < numSpecies && !flagged; i++) {
				const padded = Boolean(pad.data[b * numSpecies + i]);
				if (!padded) continue;
				const row = b * numSpecies * numSpecies + i * numSpecies;
				for (let j = 0; j < numSpecies; j++) {
					const v = Number(dist.data[row + j]);
					if (v !== 0) {
						errors.push(
							`padding_mask: species ${i} is marked padded but has distance ${v} to species ` +
								`${j} — padded rows are never written, so this is a mask polarity error ` +
								'(the convention is TRUE = PADDED)'
						);
						flagged = true;
						break;
					}
				}
			}
		}
		const real = Array.from(pad.data.slice(0, numSpecies)).filter((v) => !v).length;
		if (real === 0) {
			errors.push('padding_mask: every species is marked padded — no taxa would reach the model');
		}
	}

	if (dist) {
		// d(i,i) = 0 by definition. A nonzero diagonal means whatever was built is not a distance
		// matrix — most often an adjacency or a similarity matrix that took the same code path.
		for (let b = 0; b < batch; b++) {
			for (let i = 0; i < numSpecies; i++) {
				const self = Number(dist.data[b * numSpecies * numSpecies + i * numSpecies + i]);
				if (self !== 0) {
					errors.push(`dist_matrix: self-distance d(${i},${i}) is ${self}, expected 0`);
					b = batch;
					break;
				}
			}
		}
	}

	if (dist) {
		for (let i = 0; i < dist.data.length; i++) {
			const v = Number(dist.data[i]);
			if (!Number.isFinite(v)) {
				errors.push(`dist_matrix[${i}] is ${v}`);
				break;
			}
			if (v < 0) {
				// Not a shape error — a real one. DM3's own NJ emits negative branch lengths and the
				// Python inference path throws on them rather than degrading; see
				// src/lib/utils/treeSanitation.js for the measurement and the crash site.
				errors.push(`dist_matrix[${i}] = ${v} — negative patristic distance`);
				break;
			}
		}
	}

	return { ok: errors.length === 0, errors };
}

module.exports = {
	CODON_ORDER,
	CODON_GAP,
	CODON_UNKNOWN,
	NUM_CODON_TOKENS,
	AA_LIST,
	AA_GAP,
	AA_UNKNOWN,
	CODON_VALID_BELOW,
	AA_VALID_BELOW,
	MAX_SPECIES_DEFAULT,
	WINDOW_SIZE_DEFAULT,
	MDS_COMPONENTS,
	PADDING_MASK_TRUE_MEANS_PADDED,
	INPUT_SPEC,
	OUTPUT_SPEC,
	VERIFIED_MODEL_SHA256,
	INPUT_NAMES,
	validateInputBundle,
};
