/**
 * Alignment & parameter validation for MCP.
 * Pure functions — no Redis or analysis constructor dependencies.
 */

const STOP_CODONS = ["TAA", "TAG", "TGA"];

/**
 * Parse FASTA (or simple NEXUS) text into [{name, seq}].
 * Handles interleaved FASTA and strips gaps.
 */
function parseFasta(text) {
  if (!text || typeof text !== "string") return [];

  const lines = text.split(/\r?\n/);
  const sequences = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.charAt(0) === ">") {
      if (current) sequences.push(current);
      current = { name: line.slice(1).trim(), seq: "" };
    } else if (current) {
      // Strip gaps and whitespace from sequence data
      current.seq += line.replace(/[\s\-.]/g, "");
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
  const errors = [];
  for (let i = 0; i < sequences.length; i++) {
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
  const warnings = [];

  for (let i = 0; i < sequences.length; i++) {
    const seq = sequences[i].seq.toUpperCase();
    if (seq.length < 6) continue; // Need at least 2 codons

    const internalLen = seq.length - 3; // Exclude last codon
    for (let j = 0; j < internalLen; j += 3) {
      const codon = seq.substring(j, j + 3);
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
  const result = {
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

  const sequences = parseFasta(alignment);
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
  for (let i = 0; i < sequences.length; i++) {
    if (sequences[i].seq.length === 0) {
      result.valid = false;
      result.errors.push("Sequence \"" + sequences[i].name + "\" is empty");
    }
  }

  if (!result.valid) return result;

  // Use first sequence length as reference
  result.alignment_length = sequences[0].seq.length;

  // Check codon frame
  const frameCheck = checkCodonFrame(sequences);
  if (!frameCheck.valid) {
    // This is a warning for general validation; becomes error for codon-requiring analyses
    result.warnings = result.warnings.concat(frameCheck.errors);
  }

  // Check stop codons (only if in codon frame)
  if (frameCheck.valid) {
    const stopCheck = checkStopCodons(sequences);
    result.warnings = result.warnings.concat(stopCheck.warnings);
  }

  return result;
}

// Methods that require codon-aligned input
const CODON_METHODS = [
  "absrel", "busted", "fel", "cfel", "fubar", "meme", "slac",
  "relax", "multihit", "fade", "bgm", "prime", "difFubar",
  "gard", "nrm", "bstill", "axomeme"
];

// Methods that require a tree
const TREE_METHODS = [
  "absrel", "busted", "fel", "cfel", "fubar", "meme", "slac",
  "relax", "multihit", "fade", "bgm", "prime", "difFubar",
  "gard", "nrm", "bstill", "axomeme"
];

/**
 * Extract branch labels like {TEST}, {REFERENCE}, {FG} from a Newick tree string.
 * Returns array of unique label strings (without braces).
 */
function extractBranchLabels(tree) {
  if (!tree) return [];
  const matches = tree.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  const labels = {};
  for (let i = 0; i < matches.length; i++) {
    labels[matches[i].slice(1, -1)] = true;
  }
  return Object.keys(labels);
}

/**
 * Validate analysis-specific parameters.
 * Returns {valid, errors[], warnings[]}
 */
function validateAnalysisParams(type, tree, params) {
  const result = { valid: true, errors: [], warnings: [] };

  if (!type) {
    result.valid = false;
    result.errors.push("Analysis type is required");
    return result;
  }

  const labels = extractBranchLabels(tree);

  // RELAX requires {TEST} and {REFERENCE} branch labels
  if (type === "relax") {
    const hasTest = labels.indexOf("TEST") !== -1 || labels.indexOf("test") !== -1;
    const hasRef = labels.indexOf("REFERENCE") !== -1 || labels.indexOf("reference") !== -1;
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

  // AxoMEME is a neural surrogate, not a HyPhy method, and its gates differ from every
  // other entry above: the tree is not optional (the model reads branch lengths as the
  // distance matrix it scores against), and reference_sequence is interpolated into a
  // SLURM --export list downstream, so the name whitelist is a security control.
  //
  // Required here rather than at module scope on purpose: lib/mcp/stdio.js is spawned once
  // per tool invocation, so a top-level require would make every list_analyses /
  // get_job_status call pay for loading the AxoMEME core (same reasoning as lib/mcp/tools.js).
  // predict.js does not pull in onnxruntime-node — session.js defers that to loadSession.
  if (type === "axomeme") {
    const { SAFE_SEQUENCE_NAME, CALL_MODES } = require("../axomeme/predict.js");
    const { treeHasBranchLengths } = require("../axomeme/vendor/tree-inspect.js");

    if (!tree) {
      result.valid = false;
      result.errors.push(
        "AxoMEME requires a tree with branch lengths — it reads them as evolutionary " +
        "distances — and none was supplied. Infer a neighbor-joining tree or upload " +
        "your own before running it."
      );
    } else if (!treeHasBranchLengths(tree)) {
      result.valid = false;
      result.errors.push(
        "AxoMEME requires a tree with branch lengths — it reads them as evolutionary " +
        "distances. This tree has none, so every pair of sequences would look equally " +
        "related. Infer a neighbor-joining tree or upload one with branch lengths."
      );
    }

    if (params && params.reference_sequence != null &&
        !SAFE_SEQUENCE_NAME.test(params.reference_sequence)) {
      result.valid = false;
      result.errors.push(
        "reference_sequence is not a usable sequence name. Allowed characters are " +
        "letters, digits, underscore (_), dot (.), pipe (|), colon (:) and hyphen (-), " +
        "1-128 characters. Spaces, commas, quotes and other shell metacharacters are " +
        "refused. Use the sequence's name exactly as it appears in the alignment header."
      );
    }

    if (params && params.call_mode != null &&
        CALL_MODES.indexOf(params.call_mode) === -1) {
      result.valid = false;
      result.errors.push(
        "Unknown call_mode \"" + params.call_mode + "\". Valid modes: " +
        CALL_MODES.join(", ") + "."
      );
    }

    // max_species: the same 2-512 integer bound axomeme_scan's zod schema enforces.
    // Without this, spawn_analysis waves through max_species: 99999 or 0 and the job
    // descriptor silently CLAMPS it into range — the caller gets a 512-taxon run they
    // never asked for and no indication their number was ignored. Refusing here also
    // keeps the two AxoMEME surfaces (axomeme_scan vs spawn_analysis) answering the
    // same way to the same argument.
    if (params && params.max_species != null) {
      const maxSpecies = Number(params.max_species);
      if (!Number.isInteger(maxSpecies) || maxSpecies < 2 || maxSpecies > 512) {
        result.valid = false;
        result.errors.push(
          "max_species must be a whole number between 2 and 512 (got " +
          JSON.stringify(params.max_species) + ")."
        );
      }
    }

    // AxoMEME has no genetic-code option — the universal code is baked into the model.
    // A caller who sends genetic_code would otherwise get universal-code results with
    // nothing telling them their code was dropped, and would read the site numbering as
    // if their code had been honoured.
    if (params && (params.genetic_code != null || params.gencodeid != null)) {
      result.warnings.push(
        "AxoMEME has no genetic-code option — the universal genetic code is baked into " +
        "the model, so the genetic code you supplied is ignored. Run MEME itself if you " +
        "need a non-universal code."
      );
    }
  }

  // Tree-requiring methods: warn if no tree provided. AxoMEME is excluded: it errored
  // above, and "the server will attempt to infer one" is not true of the AxoMEME path.
  if (TREE_METHODS.indexOf(type) !== -1 && type !== "axomeme" && !tree) {
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
