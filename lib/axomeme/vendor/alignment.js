/* VENDORED from veg/datamonkey3 at commit a00d3b72df26e03a9808d3ed87326f118d6f791a.
 * Composite extraction:
 *   - parseFasta, isNexusFormat, isFastaFormat, parseNexus, parseAlignment
 *     from src/lib/utils/fastaValidation.js
 *   - stripEmbeddedTrees from src/lib/services/BackendAnalysisRunner.js
 * Mechanically converted ESM->CJS (see lib/axomeme/README.md). Bodies are
 * verbatim except stripEmbeddedTrees' browser console.log calls, which are
 * removed: on the server this code runs inside lib/axomeme/cli.js, whose
 * stdout IS the job progress file.
 *
 * IMPORTANT: this parser preserves gap characters ('-', '.'). Do NOT replace
 * it with lib/mcp/validation.js parseFasta, which strips gaps for frame
 * checking — feeding AxoMEME a de-gapped alignment silently shifts every
 * gapped sequence out of column register and produces confident garbage.
 */

/**
 * Parse FASTA format string into sequences
 * @param {string} fastaContent - Raw FASTA content
 * @returns {Object} Parsed sequences and validation info
 */
function parseFasta(fastaContent) {
	if (!fastaContent?.trim()) {
		throw new Error('File is empty');
	}

	const lines = fastaContent.split(/\r?\n/);
	const sequences = [];
	let currentSequence = null;
	const headers = new Set();
	const warnings = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		if (line.startsWith('>')) {
			// Save previous sequence
			if (currentSequence) {
				sequences.push(currentSequence);
			}

			// Start new sequence
			const header = line.substring(1).trim();
			if (!header) {
				warnings.push(`Empty header at line ${i + 1}`);
			}

			if (headers.has(header)) {
				warnings.push(`Duplicate header: ${header}`);
			}
			headers.add(header);

			currentSequence = {
				header,
				sequence: ''
			};
		} else if (currentSequence) {
			// Add to current sequence (remove whitespace)
			currentSequence.sequence += line.replace(/\s/g, '');
		} else {
			throw new Error('Sequence data found before header');
		}
	}

	// Add the last sequence
	if (currentSequence) {
		sequences.push(currentSequence);
	}

	if (sequences.length === 0) {
		throw new Error('No sequences found');
	}

	return { sequences, warnings };
}

/**
 * Detect whether content is NEXUS format.
 * @param {string} content - Raw file content
 * @returns {boolean}
 */
function isNexusFormat(content) {
	return content?.trim().toLowerCase().startsWith('#nexus') ?? false;
}

/**
 * Detect whether content is FASTA format.
 * @param {string} content - Raw file content
 * @returns {boolean}
 */
function isFastaFormat(content) {
	const trimmed = content?.trim() ?? '';
	if (!trimmed) return false;
	// FASTA headers start with '>'. We also accept '#' (sequential) per HyPhy/dm2's
	// autodetect rules, but only when it's NOT '#nexus' or '#mega'.
	if (trimmed.startsWith('>')) return true;
	const lower = trimmed.toLowerCase();
	if (trimmed.startsWith('#') && !lower.startsWith('#nexus') && !lower.startsWith('#mega')) {
		return true;
	}
	return false;
}

/**
 * Parse NEXUS format string into sequences.
 * @param {string} nexusContent - Raw NEXUS content
 * @returns {Object} { sequences: [{header, sequence}], warnings: [] }
 */
function parseNexus(nexusContent) {
	if (!nexusContent?.trim()) {
		throw new Error('File is empty');
	}

	const sequences = [];
	const warnings = [];

	const matrixMatch = nexusContent.match(/MATRIX\s*\n([\s\S]*?)\s*;/i);
	if (!matrixMatch) {
		throw new Error('No MATRIX block found in NEXUS file');
	}

	const matrixContent = matrixMatch[1];
	const lines = matrixContent.split('\n');

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;

		const parts = trimmedLine.split(/\s+/);
		if (parts.length >= 2) {
			const name = parts[0];
			const sequence = parts.slice(1).join('').replace(/\s/g, '');
			if (name && sequence) {
				sequences.push({ header: name, sequence });
			}
		}
	}

	if (sequences.length === 0) {
		throw new Error('No sequences found in NEXUS MATRIX block');
	}

	return { sequences, warnings };
}

/**
 * Parse alignment content in either FASTA or NEXUS format.
 * @param {string} content - Raw alignment content
 * @returns {Object} { sequences: [{header, sequence}], warnings: [] }
 */
function parseAlignment(content) {
	if (isNexusFormat(content)) {
		return parseNexus(content);
	}
	return parseFasta(content);
}

/**
 * Strip embedded trees from alignment data
 * Both NEXUS and FASTA files can contain embedded trees that take precedence over separate tree files
 */
function stripEmbeddedTrees(alignmentData) {
	let cleaned = alignmentData;

	// Handle NEXUS format - look for TREES blocks
	if (alignmentData.toLowerCase().includes('#nexus')) {
		const treesBlockRegex = /begin\s+trees\s*;.*?end\s*;/gis;
		const hasTreesBlock = treesBlockRegex.test(alignmentData);

		if (hasTreesBlock) {
			cleaned = alignmentData.replace(treesBlockRegex, '');
		}
	}

	// Handle FASTA format - look for Newick trees appended at the end
	const lines = cleaned.split('\n');
	const filteredLines = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Check if this looks like a Newick tree (starts with parenthesis, contains colons and semicolon)
		if (line.startsWith('(') && line.includes(':') && line.includes(';')) {
			// Skip this line
			continue;
		}

		// Keep all other lines
		filteredLines.push(lines[i]);
	}

	return filteredLines.join('\n');
}

module.exports = {
	parseFasta,
	isNexusFormat,
	isFastaFormat,
	parseNexus,
	parseAlignment,
	stripEmbeddedTrees,
};
