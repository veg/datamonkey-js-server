/**
 * Tests for AxoMEME output postprocessing.
 *
 * The transformations here are the ones that turn model outputs into numbers a researcher reads, and
 * every one of them is a place where "looks plausible" and "correct" differ by a lot. A missing
 * expm1 does not crash; it just reports every rate too low. An invariant site scored rather than
 * zeroed does not crash; it reports selection at a site where nothing varies.
 *
 * Expected values are derived from the reference's arithmetic, not recorded from this code.
 */
const { expect } = require('../shim.js');
const {
	buildPredictions,
	isSiteVariable,
	siteVariability,
	CALL_DEFAULTS,
	NEUTRAL_CALL
} = require('../../../lib/axomeme/vendor/postprocess.js');

/** Raw graph outputs for `n` sites, all heads constant unless overridden. */
function outputs(n, over = {}) {
	const fill = (v) => new Float32Array(n).fill(v);
	return {
		lrt: over.lrt ?? fill(1),
		alpha: over.alpha ?? fill(0),
		beta_neg: over.beta_neg ?? fill(0),
		beta_pos: over.beta_pos ?? fill(0),
		p_neg: over.p_neg ?? fill(0.25)
	};
}

describe('isSiteVariable', () => {
	it('is true when more than one amino acid is present', () => {
		expect(isSiteVariable(['ATG', 'TTA'])).toBe(true); // M, L
	});

	it('is false when every codon codes the same amino acid', () => {
		expect(isSiteVariable(['TTA', 'TTG', 'CTA'])).toBe(false); // all Leucine
		expect(isSiteVariable(['ATG', 'ATG'])).toBe(false);
	});

	it('is TRUE for a serine island — synonymous but selection-relevant', () => {
		// The condition that is easy to drop. Serine is the one residue whose codons occupy two
		// disjoint blocks (TCN and AGY), so switching between them is synonymous yet needs multiple
		// substitutions. Every codon here is Serine, so the amino-acid test alone says "invariant".
		expect(isSiteVariable(['TCA', 'AGC'])).toBe(true);
		expect(isSiteVariable(['TCT', 'AGT'])).toBe(true);
		// ...but only when BOTH families are present.
		expect(isSiteVariable(['TCA', 'TCG'])).toBe(false);
		expect(isSiteVariable(['AGC', 'AGT'])).toBe(false);
	});

	it('is false for an empty site', () => {
		expect(isSiteVariable([])).toBe(false);
		expect(isSiteVariable(null)).toBe(false);
	});
});

describe('siteVariability', () => {
	it('ignores gapped and ambiguous codons when judging a site', () => {
		// Site 0: ATG / --- / ANT -> only one usable codon, so not variable.
		// Site 1: TTA / TTG / TTT -> Leu, Leu, Phe -> variable.
		const flags = siteVariability(['ATGTTA', '---TTG', 'ANTTTT'], 2);
		expect(flags).toEqual([false, true]);
	});

	it('lets a short sequence contribute nothing past its end', () => {
		const flags = siteVariability(['ATGTTA', 'ATG'], 2);
		expect(flags[1]).toBe(false); // only one codon reaches site 1
	});
});

describe('buildPredictions', () => {
	const sites = (n, variable = true) => ({
		refCodons: new Array(n).fill('ATG'),
		variable: new Array(n).fill(variable)
	});

	it('applies expm1 to the rate heads', () => {
		// The heads are softplus, so the graph emits log1p(rate). expm1(1) = e - 1 = 1.7182818...
		const rows = buildPredictions(
			outputs(1, { alpha: new Float32Array([1]), beta_pos: new Float32Array([2]) }),
			sites(1)
		);
		expect(rows[0].alphaDs).toBeCloseTo(Math.E - 1, 6);
		expect(rows[0].betaPosDn).toBeCloseTo(Math.exp(2) - 1, 6);
	});

	it('reports p_pos as 1 - p_neg', () => {
		const rows = buildPredictions(outputs(1, { p_neg: new Float32Array([0.25]) }), sites(1));
		expect(rows[0].pPos).toBeCloseTo(0.75, 6);
	});

	it('treats lrt as the LRT and DERIVES the log, not the other way round', () => {
		// Worth pinning: the export is eval mode, so `lrt` is already ordinal-decoded and is the LRT
		// itself. The reference computes predicted_log_lrt = log1p(predicted_lrt).
		const rows = buildPredictions(outputs(1, { lrt: new Float32Array([4]) }), sites(1));
		expect(rows[0].lrt).toBeCloseTo(4, 6);
		expect(rows[0].logLrt).toBeCloseTo(Math.log1p(4), 6);
	});

	it('clamps a negative lrt or rate to zero', () => {
		const rows = buildPredictions(
			outputs(1, { lrt: new Float32Array([-2]), alpha: new Float32Array([-3]) }),
			sites(1)
		);
		expect(rows[0].lrt).toBe(0);
		expect(rows[0].alphaDs).toBe(0);
	});

	it('ZEROES an invariant site instead of scoring it', () => {
		// The reference zeroes before consulting the model. A large model output at an invariant site
		// must not reach the user — those zeros mean "not applicable", not "no selection".
		const rows = buildPredictions(outputs(2, { lrt: new Float32Array([99, 99]) }), {
			refCodons: ['ATG', 'ATG'],
			variable: [false, true]
		});
		expect(rows[0].lrt).toBe(0);
		expect(rows[0].call).toBe(NEUTRAL_CALL);
		expect(rows[0].isVariable).toBe(false);
		expect(rows[1].lrt).toBe(99);
	});

	it('excludes invariant sites from the local statistics', () => {
		// If the zeroed sites were included they would drag the mean down and inflate every z-score.
		const lrt = new Float32Array([0, 10, 20, 30]);
		const withInvariant = buildPredictions(outputs(4, { lrt }), {
			refCodons: new Array(4).fill('ATG'),
			variable: [false, true, true, true]
		});
		const onlyVariable = buildPredictions(outputs(3, { lrt: new Float32Array([10, 20, 30]) }), {
			refCodons: new Array(3).fill('ATG'),
			variable: [true, true, true]
		});
		expect(withInvariant[1].zScore).toBeCloseTo(onlyVariable[0].zScore, 10);
		expect(withInvariant[3].zScore).toBeCloseTo(onlyVariable[2].zScore, 10);
	});

	it('computes z-scores with the POPULATION standard deviation', () => {
		// np.std, not pandas' sample std — the difference is a factor of sqrt(n/(n-1)), which for
		// three sites is 22%.
		const rows = buildPredictions(outputs(3, { lrt: new Float32Array([1, 2, 3]) }), sites(3));
		// mean 2, population std = sqrt(2/3) = 0.8165
		expect(rows[0].zScore).toBeCloseTo(-1 / Math.sqrt(2 / 3), 6);
		expect(rows[1].zScore).toBeCloseTo(0, 10);
		expect(rows[2].zScore).toBeCloseTo(1 / Math.sqrt(2 / 3), 6);
	});

	it('gives a zero z-score when every site is identical, rather than dividing by zero', () => {
		const rows = buildPredictions(outputs(3, { lrt: new Float32Array([5, 5, 5]) }), sites(3));
		for (const r of rows) expect(r.zScore).toBe(0);
	});

	it('averages percentile ranks across ties, matching pandas', () => {
		// [10, 20, 20, 40]: the tied pair share rank (2+3)/2 = 2.5 -> 62.5%.
		const rows = buildPredictions(
			outputs(4, { lrt: new Float32Array([10, 20, 20, 40]) }),
			sites(4)
		);
		expect(rows[0].percentile).toBeCloseTo(25, 6);
		expect(rows[1].percentile).toBeCloseTo(62.5, 6);
		expect(rows[2].percentile).toBeCloseTo(62.5, 6);
		expect(rows[3].percentile).toBeCloseTo(100, 6);
	});

	it("DEFAULTS TO percentile, not the reference driver's pvalue", () => {
		// Measured, not preferential. Across 12 real DataMonkey submissions and 662 variable sites the
		// highest predicted LRT anywhere was 3.902; one site cleared the 3.12 gate and none cleared
		// 4.45 — including an alignment where MEME itself reports 17 sites at p <= 0.05. Under pvalue
		// this feature reports nothing on real data.
		expect(CALL_DEFAULTS.mode).toBe('percentile');
		// The gates themselves are unchanged, so switching modes still reproduces the reference.
		expect(CALL_DEFAULTS.tier1LrtGate).toBe(4.45);
		expect(CALL_DEFAULTS.tier2LrtGate).toBe(3.12);
		expect(CALL_DEFAULTS.tier1Percentile).toBe(98.0);
		expect(CALL_DEFAULTS.tier2Percentile).toBe(95.0);
	});

	it('returns top-ranked sites by default even when no score approaches an LRT gate', () => {
		// The whole reason for the default. These scores are realistic for the model — nothing near
		// 3.12 — and pvalue mode calls nothing on them while percentile surfaces the top of the range.
		const lrt = new Float32Array(100);
		for (let i = 0; i < 100; i++) lrt[i] = (i / 99) * 2.5;
		const ranked = buildPredictions(outputs(100, { lrt }), sites(100));
		expect(ranked.filter((r) => r.call !== NEUTRAL_CALL).length).toBeGreaterThan(0);
		const gated = buildPredictions(outputs(100, { lrt }), sites(100), { mode: 'pvalue' });
		expect(gated.filter((r) => r.call !== NEUTRAL_CALL)).toEqual([]);
	});

	it('labels tiers by what they MEAN, not by a confidence word', () => {
		// "High"/"Medium" imply a calibrated confidence the model does not have. Each label states the
		// rule that produced it, so a reader can see it is relative to this alignment.
		const lrt = new Float32Array(100);
		for (let i = 0; i < 100; i++) lrt[i] = i;
		const pct = buildPredictions(outputs(100, { lrt }), sites(100));
		expect(pct.map((r) => r.call)).toContain('Top 2%');
		expect(pct.map((r) => r.call)).toContain('Top 5%');

		// A uniform spread cannot reach z = 2.5 — its maximum z is about 1.73 regardless of n — so this
		// needs a genuine outlier. Same bound as the short-alignment case pinned further down.
		const spike = new Float32Array(100).fill(1);
		spike[42] = 100;
		const z = buildPredictions(outputs(100, { lrt: spike }), sites(100), { mode: 'zscore' });
		expect(z[42].call).toBe('Z ≥ 2.5');

		const p = buildPredictions(
			outputs(4, { lrt: new Float32Array([5.0, 3.5, 3.13, 1.0]) }),
			sites(4),
			{ mode: 'pvalue' }
		);
		expect(p[0].call).toBe('LRT ≥ 4.45');
		expect(p[1].call).toBe('LRT ≥ 3.12');
		expect(p[3].call).toBe(NEUTRAL_CALL);
	});

	it('still reproduces the reference exactly when pvalue mode is chosen', () => {
		const rows = buildPredictions(
			outputs(4, { lrt: new Float32Array([5.0, 3.5, 3.13, 1.0]) }),
			sites(4),
			{ mode: 'pvalue' }
		);
		expect(rows[0].call).toMatch(/4\.45/);
		expect(rows[1].call).toMatch(/3\.12/);
		expect(rows[2].call).toMatch(/3\.12/);
		expect(rows[3].call).toBe(NEUTRAL_CALL);
	});

	it('does NOT call a site whose float32 LRT lands just under the gate', () => {
		// A boundary worth pinning rather than smoothing. The gates are float64 literals but the model
		// emits float32, and 3.12 is not representable: Float32Array([3.12])[0] is 3.119999885559082,
		// which fails `>= 3.12`. The reference behaves identically — torch's .item() widens the same
		// float32 to float64 — so this is faithful, not a rounding bug to fix. It does mean a site
		// sitting exactly on a gate falls to the lower tier.
		const exact = new Float32Array([3.12]);
		expect(exact[0]).toBeLessThan(3.12);
		const rows = buildPredictions(outputs(1, { lrt: exact }), sites(1), { mode: 'pvalue' });
		expect(rows[0].call).toBe(NEUTRAL_CALL);
	});

	it('supports the zscore and percentile call modes', () => {
		// NOTE the site count. With a POPULATION standard deviation, |z| is bounded by sqrt(n-1), so
		// zscore mode cannot call anything at all on fewer than 5 variable sites — at n=4 the maximum
		// possible z is 1.732, below even the Tier 2 threshold of 2.0. Ten sites clears it.
		const lrt = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 100]);
		const z = buildPredictions(outputs(10, { lrt }), sites(10), { mode: 'zscore' });
		expect(z[9].call).toMatch(/^Z ≥ /); // the outlier
		expect(z[0].call).toBe(NEUTRAL_CALL);

		const p = buildPredictions(outputs(10, { lrt }), sites(10), {
			mode: 'percentile',
			tier1Percentile: 90,
			tier2Percentile: 70
		});
		expect(p[9].call).toBe('Top 10%');
		expect(p[0].call).toBe(NEUTRAL_CALL);
	});

	it('zscore mode is structurally unable to call short alignments', () => {
		// The consequence of the sqrt(n-1) bound, stated as its own fact so it is not rediscovered as
		// "the model found nothing". Four variable sites, one of them enormous, and nothing calls.
		const rows = buildPredictions(
			outputs(4, { lrt: new Float32Array([1, 2, 3, 1000]) }),
			sites(4),
			{ mode: 'zscore' }
		);
		expect(Math.max(...rows.map((r) => r.zScore))).toBeLessThan(Math.sqrt(3) + 1e-9);
		expect(rows.every((r) => r.call === NEUTRAL_CALL)).toBe(true);
	});

	it('does not invent an amino acid for a gapped reference codon', () => {
		const rows = buildPredictions(outputs(1), { refCodons: ['A-G'], variable: [true] });
		expect(rows[0].refAa).toBe('?');
	});

	it('numbers sites from 1', () => {
		const rows = buildPredictions(outputs(3), sites(3));
		expect(rows.map((r) => r.site)).toEqual([1, 2, 3]);
	});
});
