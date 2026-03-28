/**
 * Alignment & parameter validation for MCP.
 * Pure functions — no Redis or analysis constructor dependencies.
 */

var STOP_CODONS = ["TAA", "TAG", "TGA"];

/**
 * Parse FASTA (or simple NEXUS) text into [{name, seq}].
 * Handles interleaved FASTA and strips gaps.
 */
function parseFasta(text) {
  if (!text || typeof text !== "string") return [];

  var lines = text.split(/\r?\n/);
  var sequences = [];
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    if (line.charAt(0) === ">") {
      if (current) sequences.push(current);
      current = { name: line.slice(1).trim(), seq: "" };
    } else if (current) {
      // Strip gaps and whitespace from sequence data
      current.seq += line.replace(/[\s\-\.]/g, "");
    }
  }
  if (current) sequences.push(current);

  return sequences;
}

/**
 * Check that all sequences have length divisible by 3 (codon frame).
 * Returns {valid, errors}
 */
function checkCodonFrame(sequences) {
  var errors = [];
  for (var i = 0; i < sequences.length; i++) {
    if (sequences[i].seq.length % 3 !== 0) {
      errors.push(
        "Sequence \"" + sequences[i].name + "\" length " +
        sequences[i].seq.length + " is not divisible by 3 (not in codon frame)"
      );
    }
  }
  return { valid: errors.length === 0, errors: errors };
}

/**
 * Detect internal stop codons (TAA/TAG/TGA) under Universal genetic code.
 * Only checks internal codons (not the last codon which is expected to be a stop).
 * Returns {warnings}
 */
function checkStopCodons(sequences) {
  var warnings = [];

  for (var i = 0; i < sequences.length; i++) {
    var seq = sequences[i].seq.toUpperCase();
    if (seq.length < 6) continue; // Need at least 2 codons

    var internalLen = seq.length - 3; // Exclude last codon
    for (var j = 0; j < internalLen; j += 3) {
      var codon = seq.substring(j, j + 3);
      if (STOP_CODONS.indexOf(codon) !== -1) {
        warnings.push(
          "Sequence \"" + sequences[i].name + "\" has internal stop codon " +
          codon + " at position " + (j + 1)
        );
        break; // One warning per sequence is enough
      }
    }
  }

  return { warnings: warnings };
}

/**
 * Validate an alignment string.
 * Returns {valid, errors[], warnings[], sequence_count, alignment_length}
 */
function validateAlignment(alignment) {
  var result = {
    valid: true,
    errors: [],
    warnings: [],
    sequence_count: 0,
    alignment_length: 0
  };

  if (!alignment || typeof alignment !== "string" || alignment.trim().length === 0) {
    result.valid = false;
    result.errors.push("Alignment is empty or not provided");
    return result;
  }

  var sequences = parseFasta(alignment);
  if (sequences.length === 0) {
    result.valid = false;
    result.errors.push("Could not parse any sequences from the alignment");
    return result;
  }

  result.sequence_count = sequences.length;

  if (sequences.length < 2) {
    result.valid = false;
    result.errors.push("Alignment must contain at least 2 sequences (found " + sequences.length + ")");
    return result;
  }

  // Check that sequences are non-empty
  for (var i = 0; i < sequences.length; i++) {
    if (sequences[i].seq.length === 0) {
      result.valid = false;
      result.errors.push("Sequence \"" + sequences[i].name + "\" is empty");
    }
  }

  if (!result.valid) return result;

  // Use first sequence length as reference
  result.alignment_length = sequences[0].seq.length;

  // Check codon frame
  var frameCheck = checkCodonFrame(sequences);
  if (!frameCheck.valid) {
    // This is a warning for general validation; becomes error for codon-requiring analyses
    result.warnings = result.warnings.concat(frameCheck.errors);
  }

  // Check stop codons (only if in codon frame)
  if (frameCheck.valid) {
    var stopCheck = checkStopCodons(sequences);
    result.warnings = result.warnings.concat(stopCheck.warnings);
  }

  return result;
}

// Methods that require codon-aligned input
var CODON_METHODS = [
  "absrel", "busted", "fel", "cfel", "fubar", "meme", "slac",
  "relax", "multihit", "fade", "bgm", "prime", "difFubar",
  "gard", "nrm", "bstill"
];

// Methods that require a tree
var TREE_METHODS = [
  "absrel", "busted", "fel", "cfel", "fubar", "meme", "slac",
  "relax", "multihit", "fade", "bgm", "prime", "difFubar",
  "gard", "nrm", "bstill", "flea"
];

/**
 * Extract branch labels like {TEST}, {REFERENCE}, {FG} from a Newick tree string.
 * Returns array of unique label strings (without braces).
 */
function extractBranchLabels(tree) {
  if (!tree) return [];
  var matches = tree.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  var labels = {};
  for (var i = 0; i < matches.length; i++) {
    labels[matches[i].slice(1, -1)] = true;
  }
  return Object.keys(labels);
}

/**
 * Validate analysis-specific parameters.
 * Returns {valid, errors[], warnings[]}
 */
function validateAnalysisParams(type, tree, params) {
  var result = { valid: true, errors: [], warnings: [] };

  if (!type) {
    result.valid = false;
    result.errors.push("Analysis type is required");
    return result;
  }

  var labels = extractBranchLabels(tree);

  // RELAX requires {TEST} and {REFERENCE} branch labels
  if (type === "relax") {
    var hasTest = labels.indexOf("TEST") !== -1 || labels.indexOf("test") !== -1;
    var hasRef = labels.indexOf("REFERENCE") !== -1 || labels.indexOf("reference") !== -1;
    if (!hasTest || !hasRef) {
      result.valid = false;
      result.errors.push(
        "RELAX requires tree with {TEST} and {REFERENCE} branch labels. " +
        "Found labels: [" + (labels.length > 0 ? labels.join(", ") : "none") + "]. " +
        "Label your tree branches like: ((seq1,seq2){TEST},seq3){REFERENCE};"
      );
    }
  }

  // Contrast-FEL requires ≥2 branch group labels
  if (type === "cfel") {
    if (labels.length < 2) {
      result.valid = false;
      result.errors.push(
        "Contrast-FEL requires a tree with at least 2 distinct branch group labels. " +
        "Found labels: [" + (labels.length > 0 ? labels.join(", ") : "none") + "]. " +
        "Example: ((seq1,seq2){Group1},seq3,seq4){Group2};"
      );
    }
  }

  // Differential FUBAR also requires ≥2 branch groups
  if (type === "difFubar") {
    if (labels.length < 2) {
      result.valid = false;
      result.errors.push(
        "Differential FUBAR requires a tree with at least 2 distinct branch group labels. " +
        "Found labels: [" + (labels.length > 0 ? labels.join(", ") : "none") + "]."
      );
    }
  }

  // BUSTED/aBSREL: warn (not error) if no foreground branches
  if (type === "busted" || type === "absrel") {
    if (labels.length === 0 && !(params && params.branches)) {
      result.warnings.push(
        "No foreground branches specified. " +
        (type === "busted" ? "BUSTED" : "aBSREL") +
        " will test all branches (which may reduce statistical power). " +
        "Consider adding {FG} labels to your tree for branches of interest."
      );
    }
  }

  // Tree-requiring methods: warn if no tree provided
  if (TREE_METHODS.indexOf(type) !== -1 && !tree) {
    result.warnings.push(
      "No tree provided. The server will attempt to infer one, " +
      "but providing a tree is recommended for most analyses."
    );
  }

  return result;
}

exports.parseFasta = parseFasta;
exports.checkCodonFrame = checkCodonFrame;
exports.checkStopCodons = checkStopCodons;
exports.validateAlignment = validateAlignment;
exports.validateAnalysisParams = validateAnalysisParams;
exports.extractBranchLabels = extractBranchLabels;
exports.CODON_METHODS = CODON_METHODS;
exports.TREE_METHODS = TREE_METHODS;
