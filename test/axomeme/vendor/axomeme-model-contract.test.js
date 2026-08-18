/**
 * Tests for the AxoMEME 2.0 ONNX input contract.
 *
 * These are not shape-checking-the-shape-checker busywork. Every case below is a mistake a JS
 * preprocessing port actually makes — one that produces a tensor of exactly the right dtype and
 * exactly the right dimensions, and means something the model was never trained on. Those are the
 * errors that cost days, because nothing crashes: the graph runs, five numbers come out per site,
 * and they are wrong in a way that looks like a bad model rather than a bad tensor.
 *
 * The constants themselves are pinned too. They are transcribed from the ML team's handoff scripts,
 * and a transcription error in, say, the codon vocabulary order is invisible until it is compared
 * against real fixtures — which is a much later and much more expensive place to find it.
 */
const { expect } = require('../shim.js');
const {
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
	INPUT_SPEC,
	INPUT_NAMES,
	OUTPUT_SPEC,
	VERIFIED_MODEL_SHA256,
	validateInputBundle
} = require('../../../lib/axomeme/vendor/modelContract.js');

const BATCH = 2;
const SPECIES = 4; // index 3 is padded
const WIN = 1;

/** A bundle that satisfies the contract. Each test breaks exactly one thing about it. */
function validBundle() {
	const d = [
		[0, 0.1, 0.2, 0],
		[0.1, 0, 0.3, 0],
		[0.2, 0.3, 0, 0],
		[0, 0, 0, 0]
	];
	const distOne = d.flat();
	return {
		msa_codons: {
			data: new BigInt64Array([0n, 5n, 63n, 65n, 1n, 2n, 3n, 65n]),
			dims: [BATCH, SPECIES, WIN]
		},
		msa_aas: {
			data: new BigInt64Array([0n, 4n, 20n, 22n, 1n, 2n, 3n, 22n]),
			dims: [BATCH, SPECIES, WIN]
		},
		dist_matrix: {
			data: new Float32Array([...distOne, ...distOne]),
			dims: [BATCH, SPECIES, SPECIES]
		},
		mds_coords: {
			data: new Float32Array(BATCH * SPECIES * MDS_COMPONENTS),
			dims: [BATCH, SPECIES, MDS_COMPONENTS]
		}
	};
}

const check = (b) => validateInputBundle(b, { batch: BATCH, numSpecies: SPECIES, windowSize: WIN });

describe('the transcribed constants', () => {
	it('orders codons TCAG, not alphabetically', () => {
		// The single most damaging transcription error available here: an ACGT vocabulary is a valid
		// permutation of the same 64 tokens and is wrong at every site of every alignment.
		expect(CODON_ORDER).toBe('TCAG');
		const codons = [...CODON_ORDER].flatMap((a) =>
			[...CODON_ORDER].flatMap((b) => [...CODON_ORDER].map((c) => a + b + c))
		);
		expect(codons).toHaveLength(64);
		expect(codons[0]).toBe('TTT');
		expect(codons[63]).toBe('GGG');
		// If someone "fixes" the order to ACGT this is the assertion that objects.
		// Met. Under TCAG: A=2, T=0, G=3 -> 2*16 + 0*4 + 3 = 35. Under ACGT it would be 14, so this
		// single number distinguishes the two orderings.
		expect(codons.indexOf('ATG')).toBe(35);
	});

	it('keeps gap and unknown distinct, and different between the two streams', () => {
		expect(CODON_GAP).toBe(64);
		expect(CODON_UNKNOWN).toBe(65);
		expect(NUM_CODON_TOKENS).toBe(66);
		expect(AA_GAP).toBe(AA_LIST.indexOf('-'));
		expect(AA_UNKNOWN).toBe(AA_LIST.indexOf('?'));
		expect(AA_GAP).toBe(21);
		expect(AA_UNKNOWN).toBe(22);
		expect(CODON_GAP).not.toBe(AA_GAP);
	});

	it('sets the validity thresholds so that a GAP is not a valid observation', () => {
		// forward() gates on (c < 64) & (a < 21). A gap is 64 / 21, so it fails both — deliberately.
		expect(CODON_VALID_BELOW).toBe(CODON_GAP);
		expect(AA_VALID_BELOW).toBe(AA_GAP);
		expect(CODON_GAP < CODON_VALID_BELOW).toBe(false);
		expect(AA_GAP < AA_VALID_BELOW).toBe(false);
	});

	it('pins the checkpoint defaults', () => {
		expect(MAX_SPECIES_DEFAULT).toBe(512);
		expect(MDS_COMPONENTS).toBe(4);
		// window_size 1 means the central index is 0 and every window IS the site. An even window
		// would put the scored codon off-centre.
		expect(WINDOW_SIZE_DEFAULT).toBe(1);
		expect(Math.floor(WINDOW_SIZE_DEFAULT / 2)).toBe(0);
	});

	it('lists the four inputs in forward() order and marks the site-invariant ones', () => {
		expect(INPUT_NAMES).toEqual(['msa_codons', 'msa_aas', 'dist_matrix', 'mds_coords']);
		// v1-viral dropped `padding_mask`; nothing ever padded anyway, so nothing was lost but the
		// tensor. These two are computed once per alignment and expanded across sites, which is what
		// makes batching every site into a single graph run cheap.
		const invariant = INPUT_SPEC.filter((s) => s.siteInvariant).map((s) => s.name);
		expect(invariant).toEqual(['dist_matrix', 'mds_coords']);
	});

	it('names the single output the graph actually exposes', () => {
		// Read from InferenceSession.outputNames on the real artifact, not from its README. This was an
		// open question — the shipped driver reaches for the TRAIN branch to get raw ordinal logits —
		// and the answer is that the export took the EVAL branch, so `lrt` arrives already decoded.
		expect(OUTPUT_SPEC.map((o) => o.name)).toEqual(['lrt']);
		expect(OUTPUT_SPEC[0].note).toMatch(/already applied in-graph/);
	});

	it('exposes no rate heads to decode', () => {
		// The test this replaces asserted that alpha / beta_neg / beta_pos were log1p and needed
		// expm1. v1-viral does not export them, so the thing to pin is that nothing downstream can
		// find a rate head and start decoding one that is not there.
		for (const name of ['alpha', 'beta_neg', 'beta_pos', 'p_neg']) {
			expect(OUTPUT_SPEC.find((o) => o.name === name), name).toBeUndefined();
		}
	});

	it('pins the artifact the contract was verified against', () => {
		// A different export is not necessarily wrong, but the eval-mode conclusion was read off THIS
		// graph, so swapping the model without revisiting this file is a mistake worth failing on.
		expect(VERIFIED_MODEL_SHA256).toMatch(/^[0-9a-f]{64}$/);
	});

	it('cannot be mutated by a caller', () => {
		expect(() => {
			INPUT_SPEC.push({ name: 'nope' });
		}).toThrow();
	});
});

describe('validateInputBundle', () => {
	it('accepts a well-formed bundle', () => {
		const r = check(validBundle());
		expect(r.errors).toEqual([]);
		expect(r.ok).toBe(true);
	});

	it('reports a missing tensor by name', () => {
		const b = validBundle();
		delete b.mds_coords;
		expect(check(b).errors).toContain('mds_coords: missing');
	});

	it('catches a transposed distance matrix shape', () => {
		const b = validBundle();
		b.dist_matrix.dims = [BATCH, SPECIES, MDS_COMPONENTS + 1];
		expect(check(b).ok).toBe(false);
	});

	it('catches dims that are right but data that is short', () => {
		// The shape says one thing and the buffer says another — onnxruntime will happily read past
		// the end of the meaningful data or throw something opaque.
		const b = validBundle();
		b.mds_coords.data = new Float32Array(4);
		expect(check(b).errors.join(' ')).toMatch(/mds_coords: 4 elements/);
	});

	it('catches an out-of-vocabulary token', () => {
		const b = validBundle();
		b.msa_codons.data = new BigInt64Array([0n, 5n, 63n, 66n, 1n, 2n, 3n, 65n]);
		expect(check(b).errors.join(' ')).toMatch(/msa_codons\[3\] = 66/);
	});

	it('rejects a bundle carrying a tensor the graph does not accept', () => {
		// This replaces the flipped-padding-mask test. That check existed because an inverted mask is
		// well-formed in dtype, dims and element count while meaning the opposite — the model would
		// mask out every real taxon. v1-viral has no mask input, so that failure mode is gone with
		// it. What remains worth catching is a bundle built for the OLD graph reaching the new one,
		// which would otherwise fail several layers down inside session.run.
		const b = validBundle();
		b.padding_mask = { data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), dims: [2, 4] };
		const r = check(b);
		expect(r.ok, 'a stale padding_mask was accepted').toBe(false);
		expect(r.errors.join(' ')).toMatch(/no such input/);
	});

	it('catches a negative patristic distance, which is a real DM3 tree and a Python crash', () => {
		// 5% of real DM3 trees carry a branch length <= -0.1; the Python inference path throws on
		// them at predict_regression_nexus.py:955 rather than degrading. See treeSanitation.js.
		const b = validBundle();
		b.dist_matrix.data[1] = -0.4;
		const r = check(b);
		expect(r.ok).toBe(false);
		expect(r.errors.join(' ')).toMatch(/negative patristic distance/);
	});

	it('catches NaN before it reaches the graph', () => {
		const b = validBundle();
		b.dist_matrix.data[2] = NaN;
		expect(check(b).errors.join(' ')).toMatch(/dist_matrix\[2\] is NaN/);
	});

	it('catches a nonzero self-distance, which means the matrix is not a distance matrix', () => {
		const b = validBundle();
		b.dist_matrix.data[0] = 0.5; // d(0,0)
		expect(check(b).errors.join(' ')).toMatch(/self-distance/);
	});

	it('reports every independent problem, not just the first', () => {
		// A port under development usually has several at once; stopping at the first costs a whole
		// round trip per error.
		const b = validBundle();
		delete b.msa_aas;
		b.mds_coords.dims = [BATCH, SPECIES, 3];
		expect(check(b).errors.length).toBeGreaterThanOrEqual(2);
	});
});
