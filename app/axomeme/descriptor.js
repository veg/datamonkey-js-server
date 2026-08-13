/**
 * AxoMEME analysis descriptor.
 *
 * AxoMEME is a neural SURROGATE for MEME, not a HyPhy method: there is no .bf,
 * no MPI, no genetic-code option (universal is baked into the model) and no
 * branch selection. The job script (axomeme.sh) runs lib/axomeme/cli.js — a
 * single-process node program — instead of HYPHYMPI, but the job lifecycle
 * (SLURM submission, status/progress/results files, redis publishing) is the
 * standard lib/analysis-factory.js one, so the descriptor shape mirrors
 * app/meme/descriptor.js.
 *
 * NOTE on the script name: "axomeme.sh" MUST share its basename with
 * descriptor.type ("axomeme"). setTorqueParameters derives the SLURM err/out
 * log paths from the SCRIPT name while the factory builds --output/--error
 * from the TYPE — a mismatch breaks failure reporting (stderr would be read
 * from a path SLURM never wrote).
 */

const factory = require("../../lib/analysis-factory.js");
const fs = require("fs");
const utilities = require("../../lib/utilities");
const logger = require("../../lib/logger").logger;
// ONE definition of the option whitelists, shared with the MCP tool and the
// CLI. SAFE_SEQUENCE_NAME is a security control, not cosmetics: the
// reference_sequence value is interpolated into the comma-joined SLURM
// --export string, so anything outside the whitelist either breaks the export
// list or injects into it. (Requiring predict.js is cheap — onnxruntime-node
// is lazily required inside loadSession(), not at module scope.)
const {
  CALL_MODES,
  SAFE_SEQUENCE_NAME,
} = require("../../lib/axomeme/predict.js");
const {
  treeHasBranchLengths,
} = require("../../lib/axomeme/vendor/tree-inspect.js");

const descriptor = {
  type: "axomeme",
  dir: __dirname,
  script: "axomeme.sh",
  suffixes: { short: "axomeme", results: "AXOMEME", progress: "axomeme" },
  procsKey: "axomeme_procs",
  walltimeKey: "axomeme_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). Every value
  // that reaches the --export string is validated or clamped HERE, before it
  // can be interpolated.
  fields: function (self, params, src) {
    self.call_mode = CALL_MODES.includes(src.call_mode)
      ? src.call_mode
      : "percentile";

    const maxSpecies = parseInt(src.max_species, 10);
    self.max_species = Number.isFinite(maxSpecies)
      ? Math.min(512, Math.max(2, maxSpecies))
      : 512;

    // Whitelist, don't sanitize: a name that fails the pattern is dropped to
    // "" (auto-pick), never rewritten into something the user did not type.
    self.reference_sequence =
      typeof src.reference_sequence === "string" &&
      SAFE_SEQUENCE_NAME.test(src.reference_sequence)
        ? src.reference_sequence
        : "";

    // Log parity only — the model has no genetic-code option.
    self.genetic_code = "Universal";

    const isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.nj = "";
    } else if (self.params.msa) {
      self.nj = self.params.msa?.[0]?.nj || "";
    } else {
      self.nj = self.params.nj || self.params.tree || "";
    }
  },

  // Non-checkOnly side effects (MEME-family tree selection preferring
  // usertree, sanitization, output-dir creation BEFORE the tree-file write,
  // progress-file creation) that run before self.init().
  beforeInit: function (self) {
    // Determine the tree to use — prefer usertree over NJ tree.
    self.selectedTree = self.nj;

    if (
      self.params &&
      self.params.analysis &&
      self.params.analysis.msa &&
      typeof self.params.analysis.msa === "object"
    ) {
      const msa = self.params.analysis.msa[0];

      if (msa && msa.usertree && msa.usertree.trim()) {
        // Use the usertree if it is populated.
        self.selectedTree = msa.usertree;
      }
    }

    // Sanitize tree node names for Newick compatibility.
    self.selectedTree = utilities.sanitizeTreeNodeNames(self.selectedTree);
    // Sanitize FASTA names to match tree node names.
    if (self.stream && typeof self.stream === "string") {
      self.stream = utilities.sanitizeFastaNames(self.stream);
    }

    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "AXOMEME job " +
        self.id +
        ": Ensuring output directory exists at " +
        self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file.
    logger.info(
      "AXOMEME job " + self.id + ": Writing tree file to " + self.tree_fn,
      {
        tree_content: self.selectedTree
          ? self.selectedTree.length > 100
            ? self.selectedTree.substring(0, 100) + "..."
            : self.selectedTree
          : "null",
      }
    );
    fs.writeFile(self.tree_fn, self.selectedTree, function (err) {
      if (err) {
        logger.error(
          "AXOMEME job " + self.id + ": Error writing tree file: " + err.message
        );
        self.socket.emit("script error", {
          error: "Failed to write tree file: " + err.message,
        });
        return;
      }
      logger.info(
        "AXOMEME job " + self.id + ": Tree file written successfully"
      );
    });

    // Ensure the progress file exists.
    logger.info(
      "AXOMEME job " +
        self.id +
        ": Creating progress file at " +
        self.progress_fn
    );
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix. genetic_code is exported for log parity only (see fields).
  exportKeys: [
    [
      "call_mode",
      function (self) {
        return self.call_mode;
      },
    ],
    [
      "max_species",
      function (self) {
        return self.max_species;
      },
    ],
    [
      "reference_sequence",
      function (self) {
        return self.reference_sequence;
      },
    ],
    [
      "genetic_code",
      function (self) {
        return self.genetic_code;
      },
    ],
    [
      "analysis_type",
      function (self) {
        return self.type;
      },
    ],
    [
      "cwd",
      function (self) {
        return __dirname;
      },
    ],
    [
      "msaid",
      function (self) {
        return self.msaid;
      },
    ],
    [
      "procs",
      function (self, config) {
        return config.axomeme_procs;
      },
    ],
  ],
};

const axomeme = factory.makeAnalysis(descriptor);

// Override the base checkOnly validator: hyphyJob.prototype.validateParameters
// hard-requires params.genetic_code, which AxoMEME does not have (the model
// has no code option). Validate what AxoMEME actually needs instead — and
// emit EXACTLY the base's payload shape (test/validation/results.js asserts
// {valid, errors}).
axomeme.prototype.validateParameters = function () {
  const self = this;
  const errors = [];

  if (
    self.params.call_mode != null &&
    !CALL_MODES.includes(self.params.call_mode)
  ) {
    errors.push("call_mode must be one of: " + CALL_MODES.join(", "));
  }

  if (self.params.max_species != null) {
    const n = parseInt(self.params.max_species, 10);
    if (!Number.isFinite(n) || n < 2 || n > 512) {
      errors.push("max_species must be an integer between 2 and 512");
    }
  }

  if (
    self.params.reference_sequence != null &&
    self.params.reference_sequence !== "" &&
    !SAFE_SEQUENCE_NAME.test(self.params.reference_sequence)
  ) {
    errors.push(
      "reference_sequence must match " +
        SAFE_SEQUENCE_NAME.toString() +
        " (letters, digits, and _.|:- only, at most 128 characters)"
    );
  }

  // AxoMEME cannot run without a tree, and a topology-only tree must be
  // refused, not scored: the model reads branch lengths as evolutionary
  // distances, and without them it returns confident numbers computed from
  // nothing.
  const tree =
    self.params.tree ||
    self.params.msa?.[0]?.usertree ||
    self.params.msa?.[0]?.nj;
  if (!tree) {
    errors.push(
      "a phylogenetic tree is required (params.tree or msa[0].usertree / msa[0].nj)"
    );
  } else if (!treeHasBranchLengths(tree)) {
    errors.push(
      "the tree must carry branch lengths — AxoMEME reads them as evolutionary distances"
    );
  }

  self.socket.emit("validated", {
    valid: errors.length === 0,
    errors: errors,
  });

  self.socket.disconnect();
};

// Preserve the standard module export shape: exports.axomeme is the constructor.
exports.axomeme = axomeme;
exports.descriptor = descriptor;
