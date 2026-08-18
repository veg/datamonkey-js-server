/* VENDORED from veg/datamonkey3 src/lib/services/axomeme/postprocess.js
 * at commit a00d3b72df26e03a9808d3ed87326f118d6f791a.
 * Mechanically converted ESM->CJS (see lib/axomeme/README.md for the exact
 * recipe). Do NOT reformat or "fix" this file by hand -- it is kept diffable
 * against upstream. To update, re-vendor from datamonkey3 and re-apply the
 * conversion.
 */
/**
 * postprocess.js — turning the graph's raw output into per-site results.
 *
 * THE v1-viral GRAPH RETURNS ONE TENSOR: `lrt`. The retired 2.0 export returned five, and the extra
 * four heads (alpha, beta_neg, beta_pos, p_neg) are where the dS, dN+ and p columns came from. They
 * do not exist in this model, so those fields are no longer emitted AT ALL rather than reported as
 * zero. A zero in a dS column reads as "no synonymous change", which would be a fabricated
 * measurement; an absent column reads as what it is.
 *
 * `lrt` IS the LRT, already ordinal-decoded in-graph (the export is eval mode). It is NOT a log —
 * worth checking rather than assuming, because the reference derives
 * `predicted_log_lrt = log1p(predicted_lrt)`, so the log column is the DERIVED one.
 *
 * INVARIANT SITES ARE ZEROED, NOT SCORED. `if not is_var:` sets every prediction to 0 before the
 * model's output is consulted (predict_regression_nexus.py:1394-1399). A site where every sequence
 * codes the same amino acid reports 0, whatever the network said. This is the reference's behaviour
 * and it matters for the UI: those zeros are "not applicable", not "no selection", and they are
 * excluded from the z-score and percentile statistics for exactly that reason.
 *
 * Source: predict_regression_nexus.py:1386-1466.
 */

const { GENETIC_CODE, aaToken } = require("./tokenizer.js");

/**
 * Default tier gates.
 *
 * THE DEFAULT MODE IS `percentile`, WHICH IS NOT THE REFERENCE'S DEFAULT, and the reason is measured
 * rather than preferential. The reference defaults to `pvalue`, which compares the predicted LRT
 * against 4.45 and 3.12 — chi-square thresholds for a GENUINE likelihood ratio. The model's output
 * does not live on that scale. Across 12 real DataMonkey submissions and 662 variable sites, the
 * highest predicted LRT anywhere was 3.902; exactly one site cleared 3.12 and none cleared 4.45.
 * On an alignment where MEME itself reports 17 sites at p <= 0.05, the model's maximum was 2.484.
 *
 * So under `pvalue` this feature ships reporting nothing on real data. That is not a threshold worth
 * tuning — it reflects what the model is: a RANKER. The metric its authors report is Spearman rank
 * correlation, not calibration, and rank correlation can be good while absolute scale is off.
 * `percentile` asks the question the model can answer — which sites in THIS alignment look most
 * interesting — instead of one it cannot.
 *
 * The gates themselves are unchanged from the driver's argparse (lines 984-991), so switching modes
 * reproduces the reference exactly.
 */
const CALL_DEFAULTS = Object.freeze({
	mode: 'percentile',
	tier1LrtGate: 4.45, // p <= 0.05
	tier2LrtGate: 3.12, // p <= 0.10
	tier1Zscore: 2.5,
	tier2Zscore: 2.0,
	tier1Percentile: 98.0,
	tier2Percentile: 95.0
});

const NEUTRAL_CALL = 'Neutral';

/**
 * Is this site variable, in the reference's sense?
 *
 * Two conditions, and the second is easy to miss: a site is also variable if every sequence codes
 * SERINE but reaches it through both codon families (TCN and AGY). Serine is the one residue whose
 * codons occupy two disjoint blocks of the genetic code, so a TCN<->AGY switch requires multiple
 * substitutions while remaining synonymous — selection-relevant despite the amino acid never
 * changing. Dropping this condition silently marks those sites invariant and zeroes them.
 *
 * @param {string[]} codons observed codons at this site, gaps/ambiguity already excluded
 * @returns {boolean}
 */
function isSiteVariable(codons) {
	if (!codons || codons.length === 0) return false;
	const aas = new Set();
	for (const c of codons) {
		const aa = GENETIC_CODE.get(c.toUpperCase());
		if (aa && aa !== '?') aas.add(aa);
	}
	if (aas.size === 0) return false;
	if (aas.size > 1) return true;
	if (aas.size === 1 && aas.has('S')) {
		const upper = codons.map((c) => c.toUpperCase());
		const hasTCN = upper.some((c) => c === 'TCA' || c === 'TCC' || c === 'TCG' || c === 'TCT');
		const hasAGY = upper.some((c) => c === 'AGC' || c === 'AGT');
		if (hasTCN && hasAGY) return true;
	}
	return false;
}

/** Percentile rank, matching pandas `rank(pct=True) * 100` — average rank for ties. */
function percentileRanks(values) {
	const n = values.length;
	const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
	const ranks = new Float64Array(n);
	let i = 0;
	while (i < n) {
		let j = i;
		while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
		// pandas' default tie method is 'average': tied entries share the mean of their 1-based ranks.
		const avg = (i + 1 + (j + 1)) / 2;
		for (let k = i; k <= j; k++) ranks[order[k]] = avg;
		i = j + 1;
	}
	for (let k = 0; k < n; k++) ranks[k] = (ranks[k] / n) * 100;
	return ranks;
}

/**
 * Build the per-site result table.
 *
 * @param {{lrt: ArrayLike<number>}} outputs raw graph output, one entry per site
 * @param {{refCodons: string[], variable: boolean[]}} sites reference codon and variability per site
 * @param {object} [callOptions] overrides for CALL_DEFAULTS
 * @returns {Array<object>} one row per codon site, 1-indexed `site`
 */
function buildPredictions(outputs, sites, callOptions = {}) {
	const cfg = { ...CALL_DEFAULTS, ...callOptions };
	const n = sites.refCodons.length;
	const rows = [];

	for (let i = 0; i < n; i++) {
		const isVar = Boolean(sites.variable[i]);
		const refCodon = (sites.refCodons[i] ?? '').toUpperCase();
		// translate_codon() rejects gaps, N and '?' before the table lookup, so a gapped reference
		// codon has no amino acid rather than an accidental one.
		const refAa =
			refCodon.length === 3 &&
			!refCodon.includes('-') &&
			!refCodon.includes('N') &&
			!refCodon.includes('?')
				? (GENETIC_CODE.get(refCodon) ?? '?')
				: '?';

		if (!isVar) {
			// Everything zeroed BEFORE the model is consulted. These zeros mean "not applicable".
			rows.push({
				site: i + 1,
				refCodon,
				refAa,
				isVariable: false,
				lrt: 0,
				logLrt: 0,
				zScore: 0,
				percentile: 0,
				call: NEUTRAL_CALL
			});
			continue;
		}

		const lrt = Math.max(0, Number(outputs.lrt[i]));
		rows.push({
			site: i + 1,
			refCodon,
			refAa,
			isVariable: true,
			lrt,
			logLrt: Math.log1p(lrt),
			zScore: 0,
			percentile: 0,
			call: NEUTRAL_CALL
		});
	}

	// Local statistics are computed over VARIABLE SITES ONLY. Including the zeroed invariant sites
	// would drag the mean down and inflate every z-score, which is the whole reason they are excluded.
	const varIdx = rows.map((r, i) => (r.isVariable ? i : -1)).filter((i) => i >= 0);
	if (varIdx.length === 0) return rows;

	const varLrts = varIdx.map((i) => rows[i].lrt);
	const mean = varLrts.reduce((a, b) => a + b, 0) / varLrts.length;
	// Population standard deviation — np.std, not pandas' sample std.
	const variance = varLrts.reduce((a, b) => a + (b - mean) ** 2, 0) / varLrts.length;
	const std = Math.sqrt(variance);

	const pct = percentileRanks(varLrts);
	varIdx.forEach((rowIdx, k) => {
		rows[rowIdx].zScore = std > 0 ? (varLrts[k] - mean) / std : 0;
		rows[rowIdx].percentile = pct[k];
	});

	const tierLabels =
		cfg.mode === 'zscore'
			? { tier1: `Z \u2265 ${cfg.tier1Zscore}`, tier2: `Z \u2265 ${cfg.tier2Zscore}` }
			: cfg.mode === 'pvalue'
				? { tier1: `LRT \u2265 ${cfg.tier1LrtGate}`, tier2: `LRT \u2265 ${cfg.tier2LrtGate}` }
				: {
						tier1: `Top ${(100 - cfg.tier1Percentile).toFixed(0)}%`,
						tier2: `Top ${(100 - cfg.tier2Percentile).toFixed(0)}%`
					};

	for (const i of varIdx) {
		const r = rows[i];
		let t1 = false;
		let t2 = false;
		if (cfg.mode === 'zscore') {
			t1 = r.zScore >= cfg.tier1Zscore;
			t2 = !t1 && r.zScore >= cfg.tier2Zscore;
		} else if (cfg.mode === 'percentile') {
			t1 = r.percentile >= cfg.tier1Percentile;
			t2 = !t1 && r.percentile >= cfg.tier2Percentile;
		} else {
			t1 = r.lrt >= cfg.tier1LrtGate;
			t2 = !t1 && r.lrt >= cfg.tier2LrtGate;
		}
		// Labels say what the tier MEANS rather than how confident it sounds. "High" and "Medium"
		// imply a calibrated confidence the model does not have; "Top 2%" is exactly what percentile
		// mode computed, and a reader can tell at a glance that it is relative to this alignment.
		if (t1) r.call = tierLabels.tier1;
		else if (t2) r.call = tierLabels.tier2;
	}

	return rows;
}

/**
 * Variability flags for every site of an alignment, from the aligned sequences.
 *
 * Mirrors the reference's collection loop: only codons that are complete, ungapped and unambiguous
 * are considered, and a sequence shorter than the reference simply contributes nothing at the sites
 * it does not reach.
 *
 * @param {string[]} sequences aligned nucleotide sequences, same frame
 * @param {number} totalCodons
 * @returns {boolean[]}
 */
function siteVariability(sequences, totalCodons) {
	const flags = new Array(totalCodons).fill(false);
	for (let s = 0; s < totalCodons; s++) {
		const codons = [];
		for (const seq of sequences) {
			const start = s * 3;
			if (start + 3 > seq.length) continue;
			const c = seq.slice(start, start + 3).toUpperCase();
			if (c.includes('-') || c.includes('N') || c.includes('?')) continue;
			// aaToken rejects anything the genetic code cannot translate, which is the same filter the
			// reference applies before collecting a codon.
			if (aaToken(c) > 20) continue;
			codons.push(c);
		}
		flags[s] = isSiteVariable(codons);
	}
	return flags;
}

module.exports = {
	CALL_DEFAULTS,
	NEUTRAL_CALL,
	isSiteVariable,
	buildPredictions,
	siteVariability,
};
