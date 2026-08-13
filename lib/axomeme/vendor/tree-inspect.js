/* VENDORED from veg/datamonkey3 at commit a00d3b72df26e03a9808d3ed87326f118d6f791a.
 * Composite extraction:
 *   - NJ_SATURATION_SENTINEL, branchLengths, inspectBranchLengths
 *     from src/lib/utils/treeSanitation.js
 *   - treeHasBranchLengths from src/lib/services/prescreen/scope.js
 * Mechanically converted ESM->CJS (see lib/axomeme/README.md). Bodies verbatim.
 */

/** Matches a newick branch length, including scientific notation and a leading minus. */
const BRANCH_LENGTH = /:(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g;

/**
 * The value NJ.bf:99 returns for a saturated pair. It is not a distance; it is a sentinel, and it
 * reaches trees as a large positive length or, after the three-taxon subtraction, a large negative.
 */
const NJ_SATURATION_SENTINEL = 1000;

/**
 * Every branch length in a newick, in document order. Empty array for a topology-only tree.
 * @param {string|null} tree
 * @returns {number[]}
 */
function branchLengths(tree) {
	if (!tree || typeof tree !== 'string') return [];
	const out = [];
	let m;
	BRANCH_LENGTH.lastIndex = 0;
	while ((m = BRANCH_LENGTH.exec(tree)) !== null) {
		const v = parseFloat(m[1]);
		if (Number.isFinite(v)) out.push(v);
	}
	return out;
}

/**
 * Describe what is wrong with a tree's branch lengths, without changing it.
 *
 * @param {string|null} tree
 * @returns {{
 *   total: number, negative: number, negativeFraction: number, min: number|null,
 *   saturated: number, hasLengths: boolean, ok: boolean, reasons: string[]
 * }}
 */
function inspectBranchLengths(tree) {
	const lengths = branchLengths(tree);
	const negatives = lengths.filter((v) => v < 0);
	const saturated = lengths.filter((v) => Math.abs(v) >= NJ_SATURATION_SENTINEL);
	const reasons = [];

	if (!lengths.length) reasons.push('topology-only: the tree carries no branch lengths');
	if (negatives.length) {
		reasons.push(
			`${negatives.length} of ${lengths.length} branch lengths are negative ` +
				`(smallest ${Math.min(...negatives)})`
		);
	}
	if (saturated.length) {
		reasons.push(
			`${saturated.length} branch length(s) at or past the NJ saturation sentinel ` +
				`(|value| >= ${NJ_SATURATION_SENTINEL}) — these are not distances`
		);
	}

	return {
		total: lengths.length,
		negative: negatives.length,
		negativeFraction: lengths.length ? negatives.length / lengths.length : 0,
		min: lengths.length ? Math.min(...lengths) : null,
		saturated: saturated.length,
		hasLengths: lengths.some((v) => v > 0),
		ok: reasons.length === 0,
		reasons
	};
}

/**
 * Does the tree carry at least one strictly positive branch length?
 * A topology-only tree must be REFUSED, not scored: the patristic matrix is
 * meaningless on it, and the model returns a manufactured number for the 0.0
 * sentinel either way.
 *
 * @param {string|null} tree
 * @returns {boolean}
 */
function treeHasBranchLengths(tree) {
	if (!tree || typeof tree !== 'string') return false;
	const re = /:(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g;
	let m;
	while ((m = re.exec(tree)) !== null) {
		if (parseFloat(m[1]) > 0) return true;
	}
	return false;
}

module.exports = {
	NJ_SATURATION_SENTINEL,
	branchLengths,
	inspectBranchLengths,
	treeHasBranchLengths,
};
