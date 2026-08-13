/**
 * Tests for AxoMEME codon/amino-acid tokenisation.
 *
 * The block that matters most here is the last one. This port deliberately implements the TRAINING
 * tokenizer and deliberately does NOT implement the one in the handoff's inference driver, because
 * those two disagree on 63 of 64 codons. That is the kind of decision a future reader "corrects" in
 * good faith — the driver is, after all, the script the ML team ships — so the divergence is pinned
 * from both sides: these tests fail if we drift away from training, AND they fail if someone aligns
 * us to the driver.
 *
 * Everything else is the ordinary business of a tokenizer, with one thing worth stating: the
 * expected translations are the standard genetic code, checkable against any codon table, not values
 * recorded from this implementation.
 */
const { expect } = require('../shim.js');
const {
	CODON_LIST,
	CODON_TO_IDX,
	GENETIC_CODE,
	AA_TO_IDX,
	codonToken,
	aaToken,
	tokenizeSequence
} = require('../../../lib/axomeme/vendor/tokenizer.js');
const {
	CODON_GAP,
	CODON_UNKNOWN,
	AA_GAP,
	AA_UNKNOWN
} = require('../../../lib/axomeme/vendor/modelContract.js');

describe('the codon vocabulary', () => {
	it('is the 64 codons in TCAG order', () => {
		expect(CODON_LIST).toHaveLength(64);
		expect(new Set(CODON_LIST).size).toBe(64);
		expect(CODON_LIST[0]).toBe('TTT');
		expect(CODON_LIST[63]).toBe('GGG');
		// Third position varies fastest, matching [a][b][c] with c innermost.
		expect(CODON_LIST.slice(0, 4)).toEqual(['TTT', 'TTC', 'TTA', 'TTG']);
	});

	it('includes stop codons, which are real tokens and not sentinels', () => {
		for (const stop of ['TAA', 'TAG', 'TGA']) {
			expect(CODON_TO_IDX.has(stop)).toBe(true);
			expect(codonToken(stop)).toBeLessThan(64);
		}
	});
});

describe('the genetic code', () => {
	it('translates the standard code', () => {
		// Spot values anyone can check against a codon table.
		const expected = {
			ATG: 'M', // Met / start
			TGG: 'W', // the other single-codon residue
			TTT: 'F',
			TTA: 'L',
			AAA: 'K',
			GGG: 'G',
			TAA: '*',
			TAG: '*',
			TGA: '*'
		};
		for (const [codon, aa] of Object.entries(expected)) {
			expect(GENETIC_CODE.get(codon), codon).toBe(aa);
		}
	});

	it('covers every codon and has exactly three stops', () => {
		expect(GENETIC_CODE.size).toBe(64);
		for (const c of CODON_LIST) expect(GENETIC_CODE.get(c), c).toBeTruthy();
		expect(
			[...GENETIC_CODE.entries()]
				.filter(([, a]) => a === '*')
				.map(([c]) => c)
				.sort()
		).toEqual(['TAA', 'TAG', 'TGA']);
	});

	it('uses "*" for a stop, so it lands on a real AA token rather than unknown', () => {
		// The handoff's driver writes stops as '_' while its AA_LIST contains '*', so stops fall
		// through to 22 (unknown) there. Here they translate to 20.
		expect(AA_TO_IDX.get('*')).toBe(20);
		expect(aaToken('TAA')).toBe(20);
		expect(aaToken('TAA')).not.toBe(AA_UNKNOWN);
	});
});

describe('codonToken', () => {
	it('is case insensitive', () => {
		expect(codonToken('atg')).toBe(codonToken('ATG'));
	});

	it('treats a gap ANYWHERE as a gap, not as unknown', () => {
		// `'-' in codon` is a substring test in the reference, so a partial gap counts.
		expect(codonToken('---')).toBe(CODON_GAP);
		expect(codonToken('A-T')).toBe(CODON_GAP);
		expect(codonToken('AT-')).toBe(CODON_GAP);
		// And a gap outranks the length and N tests: this is length 2 AND gapped.
		expect(codonToken('A-')).toBe(CODON_GAP);
	});

	it('maps ambiguity and wrong lengths to unknown', () => {
		expect(codonToken('ANT')).toBe(CODON_UNKNOWN);
		expect(codonToken('NNN')).toBe(CODON_UNKNOWN);
		expect(codonToken('AT')).toBe(CODON_UNKNOWN);
		expect(codonToken('ATGC')).toBe(CODON_UNKNOWN);
		expect(codonToken('')).toBe(CODON_UNKNOWN);
		expect(codonToken('XYZ')).toBe(CODON_UNKNOWN);
	});
});

describe('aaToken', () => {
	it('translates, and separates gap from unknown', () => {
		expect(aaToken('ATG')).toBe(AA_TO_IDX.get('M'));
		expect(aaToken('---')).toBe(AA_GAP);
		expect(aaToken('A-T')).toBe(AA_GAP);
		expect(aaToken('ANT')).toBe(AA_UNKNOWN);
		expect(aaToken('AT')).toBe(AA_UNKNOWN);
		expect(AA_GAP).not.toBe(AA_UNKNOWN);
	});

	it('rejects "?" where codonToken does not — the reference asymmetry, same answer either way', () => {
		expect(aaToken('?A?')).toBe(AA_UNKNOWN);
		// codonToken has no '?' test, but a '?' codon is not in the map, so it lands on unknown too.
		expect(codonToken('?A?')).toBe(CODON_UNKNOWN);
	});
});

describe('tokenizeSequence', () => {
	it('tokenises in frame and drops a trailing partial codon', () => {
		// 7 nt -> 2 whole codons, matching len // 3.
		const { codons, aas } = tokenizeSequence('ATGTTTAA');
		expect(codons).toHaveLength(2);
		expect(Array.from(codons)).toEqual([codonToken('ATG'), codonToken('TTT')]);
		expect(Array.from(aas)).toEqual([AA_TO_IDX.get('M'), AA_TO_IDX.get('F')]);
	});

	it('handles an empty and a sub-codon sequence', () => {
		expect(tokenizeSequence('').codons).toHaveLength(0);
		expect(tokenizeSequence('AT').codons).toHaveLength(0);
	});

	it('carries gaps through as gap tokens', () => {
		const { codons, aas } = tokenizeSequence('ATG---');
		expect(Array.from(codons)).toEqual([codonToken('ATG'), CODON_GAP]);
		expect(Array.from(aas)).toEqual([AA_TO_IDX.get('M'), AA_GAP]);
	});
});

describe('WE USE THE TRAINING TOKENIZER, NOT THE INFERENCE DRIVER"S', () => {
	/**
	 * Measured over all 64 codons: predict_regression_nexus.py builds a 60-codon ALPHABETICAL
	 * vocabulary (lines 49-55), then redefines get_codon_token (line 74) WITHOUT redefining
	 * CODON_TO_IDX, and imports only three non-tokenizer names from the training module. So the
	 * driver disagrees with training on 63 of 64 codons, and drops TTA plus all three stops entirely.
	 *
	 * A model trained on TCAG-64 must be served TCAG-64. These are the exact values that distinguish
	 * the two, so this block fails whichever way someone drifts.
	 */
	const TRAINING = { TTT: 0, TTA: 2, TAA: 10, ATG: 35, AAA: 42, GGG: 63 };
	const DRIVER = { TTT: 59, TTA: 65, TAA: 65, ATG: 14, AAA: 0, GGG: 42 };

	it('matches the training vocabulary exactly', () => {
		for (const [codon, token] of Object.entries(TRAINING)) {
			expect(codonToken(codon), codon).toBe(token);
		}
	});

	it('does NOT match the driver vocabulary', () => {
		for (const [codon, driverToken] of Object.entries(DRIVER)) {
			expect(codonToken(codon), `${codon} matched the driver's token`).not.toBe(driverToken);
		}
	});

	it('keeps TTA and the stops as real codons, which the driver discards', () => {
		// The driver's CODON_LIST omits TTA (Leucine — almost certainly a slip when the stops were
		// removed) along with TAA/TAG/TGA, so all four collapse to "unknown" there and real leucine
		// data is thrown away.
		for (const c of ['TTA', 'TAA', 'TAG', 'TGA']) {
			expect(codonToken(c), c).toBeLessThan(64);
		}
	});
});
