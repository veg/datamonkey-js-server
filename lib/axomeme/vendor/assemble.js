/* VENDORED from veg/datamonkey3 src/lib/services/axomeme/assemble.js
 * at commit a00d3b72df26e03a9808d3ed87326f118d6f791a.
 * Mechanically converted ESM->CJS (see lib/axomeme/README.md for the exact
 * recipe). Do NOT reformat or "fix" this file by hand -- it is kept diffable
 * against upstream. To update, re-vendor from datamonkey3 and re-apply the
 * conversion.
 */
/**
 * assemble.js — turn an alignment and a tree into the five tensors the AxoMEME graph accepts.
 *
 * This is the layer that joins everything else: newick parse, patristic distances, Max-PD selection,
 * tokenisation and MDS. Two decisions in here are not obvious and both are load-bearing.
 *
 * ---------------------------------------------------------------------------------------------
 * 1. MDS IS COMPUTED ON THE PADDED MATRIX, THEN SLICED. THE MODEL IS FED ONLY THE REAL SPECIES.
 * ---------------------------------------------------------------------------------------------
 * The reference builds a [max_species, max_species] tensor — 512 x 512 by default — regardless of how
 * many taxa the alignment actually has, and runs MDS on that. The padded zeros take part in the
 * double-centring, so the coordinates genuinely depend on max_species and computing MDS on the real N
 * gives different numbers. That part must be reproduced exactly.
 *
 * Feeding those 512 slots to the GRAPH, however, is a different question, and the answer is measured
 * rather than assumed: feeding N = real species produces the same outputs as feeding N = 512 with the
 * remainder masked, to 1.192e-07 — exactly one float32 ulp. That is what masking is for; `forward()`
 * excludes padded slots from the validity mask, the distance normalisation, the attention and every
 * pooling stream, and softmax's -1e4 fill underflows to zero.
 *
 * The difference is not academic. A 441-site alignment at N=512 needs
 * 441 x 512 x 512 x 4 = 462 MB for dist_matrix alone, because ONNX needs materialised data where
 * torch used an `expand` view. At N=36 it is 2.3 MB, and attention is quadratic in N on top of that.
 * So: MDS at 512 for fidelity, graph at real N for tractability.
 *
 * ---------------------------------------------------------------------------------------------
 * 2. SPECIES ORDER COMES FROM THE TREE, NOT THE ALIGNMENT, AND THE REFERENCE SEQUENCE LEADS.
 * ---------------------------------------------------------------------------------------------
 * predict_regression_nexus.py:1069-1082 walks the TREE's leaves in order and keeps the ones present
 * in the alignment, then moves the reference sequence to index 0. Order matters twice over: it fixes
 * the row order of the distance matrix (and therefore MDS), and index 0 is the seed of the Max-PD
 * traversal, so it decides which taxa survive the cap.
 *
 * The reference sequence itself is picked by a heuristic that is a TOGA-mammal artifact — it looks
 * for sequences literally named 'hg', 'hg38' or 'human' before falling back to the first sequence in
 * the file. On DataMonkey's viral traffic that fallback is what fires essentially always.
 *
 * Sources: predict_regression_nexus.py:1049-1082 (reference + matching), 1165-1188 (Max-PD),
 * 1213-1275 (tensor allocation, pad values, MDS, the site loop).
 */

const { parseNewick, leafIndex, normalizeTaxonName } = require("./newick.js");
const { patristicMatrix, maxPdSelect } = require("./patristic.js");
const { computeMdsCoordinates } = require("./mds.js");
const { codonToken, aaToken } = require("./tokenizer.js");
const {
	MAX_SPECIES_DEFAULT,
	WINDOW_SIZE_DEFAULT,
	MDS_COMPONENTS,
	CODON_UNKNOWN,
	AA_UNKNOWN
} = require("./modelContract.js");

/** The reference-sequence heuristic, verbatim from the driver. */
const REFERENCE_HEURISTICS = ['hg', 'hg38', 'human'];

/**
 * Pick the reference sequence, whose length sets the number of sites and which leads the species
 * order. Explicit choice wins; otherwise the driver's heuristic, which falls through to the first
 * sequence for anything that is not a TOGA mammal alignment.
 *
 * @param {string[]} names
 * @param {string} [explicit]
 * @returns {string}
 */
function chooseReference(names, explicit) {
	if (explicit && names.includes(explicit)) return explicit;
	for (const h of REFERENCE_HEURISTICS) if (names.includes(h)) return h;
	return names[0];
}

/**
 * Order the taxa the way the reference does: tree leaf order, filtered to those present in the
 * alignment, with the reference sequence moved to the front.
 *
 * @param {string[]} names alignment sequence names
 * @param {any} tree parsed newick, or null
 * @param {string} referenceName
 * @returns {{order: number[], matchedFromTree: boolean}} indices into `names`
 */
function orderSpecies(names, tree, referenceName) {
	const byNormalised = new Map();
	// Later duplicates overwrite, matching the reference's `name_map[norm] = align_name`.
	names.forEach((n, i) => byNormalised.set(normalizeTaxonName(n), i));

	let order = [];
	let matchedFromTree = false;
	if (tree) {
		const seen = new Set();
		for (const leaf of tree.leaves) {
			const nm = normalizeTaxonName(tree.name[leaf]);
			if (!nm || seen.has(nm)) continue;
			seen.add(nm);
			const idx = byNormalised.get(nm);
			if (idx !== undefined) order.push(idx);
		}
		matchedFromTree = order.length > 0;
	}
	// "Zero matching species between tree and alignment. Falling back to alignment order."
	if (order.length === 0) order = names.map((_, i) => i);

	const refIdx = names.indexOf(referenceName);
	if (refIdx >= 0) {
		const at = order.indexOf(refIdx);
		if (at > 0) {
			order.splice(at, 1);
			order.unshift(refIdx);
		} else if (at < 0) {
			// The reference is not in the tree. The driver still puts it first, because its sequence
			// defines the site count and it seeds Max-PD.
			order.unshift(refIdx);
		}
	}
	return { order, matchedFromTree };
}

/**
 * Prepare everything that is per-alignment rather than per-site.
 *
 * Returns a handle whose `batch()` materialises tensors for a range of sites. Sites are chunked
 * rather than assembled in one go because the tensors are O(sites x N^2): a 12,000-codon upload at
 * even 36 species is 62 MB for dist_matrix, and DataMonkey accepts uploads that large.
 *
 * @param {{names: string[], sequences: string[], tree?: any, treeText?: string,
 *   maxSpecies?: number, windowSize?: number, referenceName?: string}} input
 */
function prepareAlignment(input) {
	const {
		names,
		sequences,
		treeText,
		maxSpecies = MAX_SPECIES_DEFAULT,
		windowSize = WINDOW_SIZE_DEFAULT,
		referenceName
	} = input;

	if (!Array.isArray(names) || !Array.isArray(sequences) || names.length !== sequences.length) {
		throw new Error('prepareAlignment: names and sequences must be parallel arrays');
	}
	if (names.length === 0) throw new Error('prepareAlignment: no sequences');

	const tree = input.tree ?? (treeText ? parseNewick(treeText) : null);
	const refName = chooseReference(names, referenceName);
	const { order, matchedFromTree } = orderSpecies(names, tree, refName);

	// --- taxon selection -------------------------------------------------------------------------
	let selected = order;
	let duplicates = 0;
	if (order.length > maxSpecies) {
		if (tree) {
			const { index } = leafIndex(tree);
			const nodes = order.map((i) => index.get(normalizeTaxonName(names[i])));
			if (nodes.every((n) => n !== undefined)) {
				const pd = maxPdSelect(tree, nodes, maxSpecies);
				duplicates = pd.duplicates;
				selected = pd.selected.map((k) => order[k]);
			} else {
				selected = order.slice(0, maxSpecies);
			}
		} else {
			// `selected_species = matching_species[:args.max_species]`
			selected = order.slice(0, maxSpecies);
		}
	}
	const n = selected.length;

	// --- distances, at the REAL species count ----------------------------------------------------
	//
	// NEGATIVE DISTANCES ARE CLAMPED TO ZERO, and this is the one place in the port that deliberately
	// alters a value rather than passing it through. The reasoning matters:
	//
	//   - DM3's own NJ inference emits negative branch lengths. `NJ.bf:214-220` computes the
	//     three-taxon closed form (d01 + d02 - d12)/2 with no Max(0, ...), so any triangle-inequality
	//     violation yields one. Most are float noise -- the demo alignment produces a patristic sum of
	//     -1.04e-5, which is zero with rounding error on it.
	//   - THE MODEL WAS TRAINED ON CLAMPED DISTANCES. The handoff README is explicit: "This build's
	//     training pipeline clamps distances >= 0." So clamping here matches what the weights were
	//     fitted against. It is the reference's INFERENCE path that omits the clamp, and that omission
	//     is exactly why it throws on 4.6% of real DM3 trees (findings log §2).
	//
	// So refusing a -1e-5 distance would reject an ordinary tree for a rounding artifact, while
	// passing it through unclamped would feed the model something training never showed it. Clamping
	// does neither. What is NOT acceptable is doing it silently, so the magnitude is recorded and a
	// meaningfully negative tree still reaches the user.
	const dist = new Float32Array(n * n);
	let clampedDistances = 0;
	let mostNegativeDistance = 0;
	if (tree) {
		const { index } = leafIndex(tree);
		const nodes = selected.map((i) => index.get(normalizeTaxonName(names[i])));
		if (nodes.every((v) => v !== undefined)) {
			const full = patristicMatrix(tree, nodes);
			// float32 because that is what dist_tensor is, and MDS is sensitive to the rounding — see
			// mds.js. Doing it here rather than there keeps a single source of the rounded values.
			for (let k = 0; k < n * n; k++) {
				const v = full[k];
				if (v < 0) {
					clampedDistances++;
					if (v < mostNegativeDistance) mostNegativeDistance = v;
					dist[k] = 0;
				} else {
					dist[k] = v;
				}
			}
		}
	}
	// No tree, or names that do not resolve: the reference falls back to an all-zero matrix rather
	// than failing, and MDS on all zeros yields all-zero coordinates.

	// --- MDS on the PADDED matrix, then sliced back ----------------------------------------------
	// This is the part that must not be "simplified" to run on `dist` directly. See the header.
	const cap = Math.max(maxSpecies, n);
	const padded = new Float64Array(cap * cap);
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) padded[i * cap + j] = dist[i * n + j];
	const paddedMds = computeMdsCoordinates(padded, cap, MDS_COMPONENTS);
	const mds = new Float32Array(n * MDS_COMPONENTS);
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < MDS_COMPONENTS; c++)
			mds[i * MDS_COMPONENTS + c] = paddedMds[i * MDS_COMPONENTS + c];
	}

	// --- tokens ----------------------------------------------------------------------------------
	const refSeq = sequences[names.indexOf(refName)] ?? sequences[0];
	const totalCodons = Math.floor(refSeq.length / 3);
	const halfWindow = Math.floor(windowSize / 2);

	// Pre-filled with the pad values, so a species whose sequence is shorter than the reference simply
	// keeps them — matching `torch.ones(...) * 65` and `* AA_TO_IDX['?']`.
	const codonTokens = new BigInt64Array(totalCodons * n * windowSize).fill(BigInt(CODON_UNKNOWN));
	const aaTokens = new BigInt64Array(totalCodons * n * windowSize).fill(BigInt(AA_UNKNOWN));

	for (let s = 0; s < n; s++) {
		const seq = sequences[selected[s]] ?? '';
		const seqCodons = Math.floor(seq.length / 3);
		for (let site = 0; site < totalCodons; site++) {
			for (let w = 0; w < windowSize; w++) {
				// `codon_pos_1based = site_idx - half_win + w_idx`, guarded to the sequence's own length.
				const pos = site + 1 - halfWindow + w;
				if (pos < 1 || pos > seqCodons) continue;
				const codon = seq.slice((pos - 1) * 3, (pos - 1) * 3 + 3);
				const at = (site * n + s) * windowSize + w;
				codonTokens[at] = BigInt(codonToken(codon));
				aaTokens[at] = BigInt(aaToken(codon));
			}
		}
	}

	// Every selected slot is a real species, so nothing is padded. The tensor is still required by the
	// graph, and is what would carry padding if a caller ever fed padded slots.
	const paddingMask = new Uint8Array(n);

	return {
		speciesCount: n,
		totalCodons,
		windowSize,
		referenceName: refName,
		selectedNames: selected.map((i) => names[i]),
		// Indices as well as names. A caller that maps a name back with `names.indexOf()` gets the
		// FIRST match, which is the wrong record when the alignment has duplicate headers — and this
		// module already resolved duplicates the other way round.
		selectedIndices: selected.slice(),
		referenceIndex: names.indexOf(refName),
		matchedFromTree,
		duplicateSelections: duplicates,
		clampedDistances,
		mostNegativeDistance,
		dist,
		mds,
		paddingMask,
		codonTokens,
		aaTokens,

		/**
		 * Materialise the five tensors for sites [start, start + count).
		 *
		 * @param {number} start
		 * @param {number} [count]
		 * @returns {Record<string, {data: any, dims: number[]}>}
		 */
		batch(start, count = totalCodons - start) {
			const b = Math.max(0, Math.min(count, totalCodons - start));
			const perSiteTokens = n * windowSize;
			const distData = new Float32Array(b * n * n);
			const mdsData = new Float32Array(b * n * MDS_COMPONENTS);
			const maskData = new Uint8Array(b * n);
			for (let k = 0; k < b; k++) {
				distData.set(dist, k * n * n);
				mdsData.set(mds, k * n * MDS_COMPONENTS);
				maskData.set(paddingMask, k * n);
			}
			return {
				msa_codons: {
					data: codonTokens.slice(start * perSiteTokens, (start + b) * perSiteTokens),
					dims: [b, n, windowSize]
				},
				msa_aas: {
					data: aaTokens.slice(start * perSiteTokens, (start + b) * perSiteTokens),
					dims: [b, n, windowSize]
				},
				dist_matrix: { data: distData, dims: [b, n, n] },
				mds_coords: { data: mdsData, dims: [b, n, MDS_COMPONENTS] },
				padding_mask: { data: maskData, dims: [b, n] }
			};
		}
	};
}

/**
 * Site count per batch that keeps the materialised tensors near `budgetBytes`.
 *
 * dist_matrix dominates at 4 * N^2 bytes per site, so this is a one-term estimate rather than an
 * accounting of every tensor. At least one site is always returned — a single site of a 512-taxon
 * alignment is 1 MB and has to go through whatever the budget says.
 *
 * @param {number} speciesCount
 * @param {number} [budgetBytes] default 64 MB
 * @returns {number}
 */
function batchSizeFor(speciesCount, budgetBytes = 64 * 1024 * 1024) {
	const perSite = 4 * speciesCount * speciesCount;
	return Math.max(1, Math.floor(budgetBytes / Math.max(perSite, 1)));
}

module.exports = {
	chooseReference,
	orderSpecies,
	prepareAlignment,
	batchSizeFor,
};
