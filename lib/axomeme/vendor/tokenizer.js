/* VENDORED from veg/datamonkey3 src/lib/services/axomeme/tokenizer.js
 * at commit a00d3b72df26e03a9808d3ed87326f118d6f791a.
 * Mechanically converted ESM->CJS (see lib/axomeme/README.md for the exact
 * recipe). Do NOT reformat or "fix" this file by hand -- it is kept diffable
 * against upstream. To update, re-vendor from datamonkey3 and re-apply the
 * conversion.
 */
/**
 * tokenizer.js — codon and amino-acid tokenisation for AxoMEME 2.0.
 *
 * THIS IMPLEMENTS THE TRAINING TOKENIZER (train_transformer_selection.py:74-97), NOT THE ONE IN THE
 * HANDOFF'S INFERENCE DRIVER. That is a deliberate, measured choice, and it is the single most
 * consequential decision in this file — see the long note in modelContract.js. In short:
 * predict_regression_nexus.py defines its own 60-codon ALPHABETICAL vocabulary at lines 49-55, then
 * redefines `get_codon_token` without redefining `CODON_TO_IDX`, so 63 of 64 codons come out with a
 * different token at inference than the model was trained on, and TTA plus the three stop codons
 * vanish into "unknown". A model trained on TCAG-64 must be served TCAG-64.
 *
 * If a future handoff fixes the driver, this file does not change — it already matches training.
 * If someone "aligns" this file to the driver, the model silently degrades and nothing fails.
 * src/test/axomeme-tokenizer.test.js pins both directions.
 */

const {
	CODON_ORDER,
	CODON_GAP,
	CODON_UNKNOWN,
	AA_LIST,
	AA_GAP,
	AA_UNKNOWN
} = require("./modelContract.js");

/**
 * The 64 codons in TCAG order — the standard genetic-code table order, so TTT is 0 and GGG is 63.
 * Built rather than transcribed: a 64-entry literal is a transcription error waiting to happen, and
 * the generator IS the reference's definition.
 */
const CODON_LIST = (() => {
	const out = [];
	for (const a of CODON_ORDER)
		for (const b of CODON_ORDER) for (const c of CODON_ORDER) out.push(a + b + c);
	return out;
})();

/** codon string -> token, for the 64 sense+stop codons. */
const CODON_TO_IDX = new Map(CODON_LIST.map((c, i) => [c, i]));

/**
 * The standard genetic code, with stops as '*' to match AA_LIST.
 *
 * Derived from the codon table rather than transcribed, for the same reason as CODON_LIST. The four
 * blocks below are the standard code's structure; every codon is covered, so there is no default.
 *
 * ONE THING WORTH FLAGGING UPSTREAM: this is the UNIVERSAL code, hard-coded. DM3 lets a user pick a
 * genetic code (mitochondrial, mycoplasma, several others) and HyPhy honours that choice, so an
 * AxoMEME prediction on a non-universal alignment translates codons the user did not ask for. That
 * is a model-side limitation, not something this file can fix — recorded here so it is not
 * rediscovered as a mystery.
 */
const GENETIC_CODE = (() => {
	// TCAG-ordered amino acids, one per codon, in the same order CODON_LIST generates.
	const table =
		'FFLLSSSSYY**CC*W' + // TTx TCx TAx TGx
		'LLLLPPPPHHQQRRRR' + // CTx CCx CAx CGx
		'IIIMTTTTNNKKSSRR' + // ATx ACx AAx AGx
		'VVVVAAAADDEEGGGG'; //  GTx GCx GAx GGx
	const map = new Map();
	CODON_LIST.forEach((c, i) => map.set(c, table[i]));
	return map;
})();

/** amino acid character -> token. */
const AA_TO_IDX = new Map([...AA_LIST].map((a, i) => [a, i]));

/**
 * Token for a codon string.
 *
 * Order of tests matters and matches the reference exactly: a gap ANYWHERE wins over everything
 * else, so `A-T` is a gap rather than an unknown. `'-' in codon` is a substring test in Python, not
 * an equality test, which is why a partial gap counts.
 *
 * @param {string} codon
 * @returns {number} 0..63 for a real codon, CODON_GAP for a gap, CODON_UNKNOWN otherwise
 */
function codonToken(codon) {
	const c = String(codon).toUpperCase();
	if (c.includes('-')) return CODON_GAP;
	if (c.length !== 3 || c.includes('N')) return CODON_UNKNOWN;
	const t = CODON_TO_IDX.get(c);
	return t === undefined ? CODON_UNKNOWN : t;
}

/**
 * Token for the amino acid a codon translates to.
 *
 * Note the asymmetry with codonToken, which is in the reference and is not a typo here: this one
 * also rejects '?', codonToken does not. A '?' codon reaches codonToken's length/N test and, being
 * length 3 without an N, falls through to the map lookup and returns CODON_UNKNOWN anyway — same
 * answer by a different route.
 *
 * @param {string} codon
 * @returns {number} 0..20 for a translated residue (20 = stop), AA_GAP or AA_UNKNOWN
 */
function aaToken(codon) {
	const c = String(codon).toUpperCase();
	if (c.includes('-')) return AA_GAP;
	if (c.length !== 3 || c.includes('N') || c.includes('?')) return AA_UNKNOWN;
	const aa = GENETIC_CODE.get(c);
	if (aa === undefined) return AA_UNKNOWN;
	const t = AA_TO_IDX.get(aa);
	return t === undefined ? AA_UNKNOWN : t;
}

/**
 * Tokenise one sequence into per-codon (codon, aa) token pairs.
 *
 * A trailing partial codon is DROPPED, matching `total_codons = len(ref_seq) // 3`. Sites beyond a
 * sequence's own length are the caller's problem: the reference leaves those at the pad value it
 * pre-filled the tensor with, which is why this returns only what the sequence actually covers.
 *
 * @param {string} seq nucleotides, gaps allowed
 * @returns {{codons: Uint8Array, aas: Uint8Array}}
 */
function tokenizeSequence(seq) {
	const s = String(seq);
	const n = Math.floor(s.length / 3);
	const codons = new Uint8Array(n);
	const aas = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const c = s.slice(i * 3, i * 3 + 3);
		codons[i] = codonToken(c);
		aas[i] = aaToken(c);
	}
	return { codons, aas };
}

module.exports = {
	CODON_LIST,
	CODON_TO_IDX,
	GENETIC_CODE,
	AA_TO_IDX,
	codonToken,
	aaToken,
	tokenizeSequence,
};
