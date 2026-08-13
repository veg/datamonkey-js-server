const { expect } = require('../shim.js');
const { prepareAlignment, batchSizeFor } = require('../../../lib/axomeme/vendor/assemble.js');

describe('review regressions', () => {
	it('exposes indices, so a duplicate FASTA header cannot resolve to the wrong record', () => {
		// names.indexOf() returns the FIRST match; orderSpecies keeps the LAST. Without indices the
		// variability flags would be computed from a different sequence than the model was fed.
		const names = ['dup', 'other', 'dup'];
		const sequences = ['ATGAAA', 'ATGTTT', 'ATGCCC'];
		const p = prepareAlignment({
			names,
			sequences,
			treeText: '((dup:0.1,other:0.2):0.05,dup:0.3);',
			maxSpecies: 8
		});
		expect(p.selectedIndices).toBeDefined();
		expect(p.selectedIndices.every((i) => Number.isInteger(i))).toBe(true);
		// The duplicate must resolve to an index whose name really is that name...
		for (let k = 0; k < p.selectedIndices.length; k++) {
			expect(names[p.selectedIndices[k]]).toBe(p.selectedNames[k]);
		}
		// ...and at least one selected index must NOT be the naive indexOf answer, or this alignment
		// would not exercise the bug.
		const naive = p.selectedNames.map((n) => names.indexOf(n));
		expect(naive).not.toEqual(p.selectedIndices);
		expect(Number.isInteger(p.referenceIndex)).toBe(true);
	});

	it('batchSizeFor can exceed the argument-spread limit, so results must not be spread', () => {
		// The number that made `push(...batch)` throw "Maximum call stack size exceeded" at ~90%
		// progress. Pinned so nobody reintroduces the spread thinking the batches are small.
		expect(batchSizeFor(10)).toBeGreaterThan(125000);
		expect(batchSizeFor(4)).toBeGreaterThan(125000);
	});
});
