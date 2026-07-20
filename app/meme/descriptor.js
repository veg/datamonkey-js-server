/**
 * MEME analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/meme/meme.js job-submission params exactly
 * (pinned by test/golden/qsub-params.snapshot.json).
 */

const factory = require("../../lib/analysis-factory.js");
const fs = require("fs");
const utilities = require("../../lib/utilities");
const logger = require("../../lib/logger").logger;

const descriptor = {
  type: "meme",
  dir: __dirname,
  script: "meme.sh",
  suffixes: { short: "meme", results: "MEME", progress: "meme" },
  procsKey: "meme_procs",
  walltimeKey: "meme_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original meme.js branches.
  fields: function (self, params, src) {
    self.multiple_hits = src.multiple_hits || "None";
    self.site_multihit = src.site_multihit || "Estimate";
    self.rates = src.rates || 2;
    self.impute_states = src.impute_states || "No";
    self.p_value = src.p_value || 0.1;
    self.bootstrap = src.bootstrap || false;
    self.resample = src.resample || 0;

    const isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
    } else {
      if (self.params.msa) {
        self.genetic_code = self.params.msa[0]
          ? require("../code").code[self.params.msa[0].gencodeid + 1]
          : "Universal";
        self.nj = self.params.msa[0] ? self.params.msa[0].nj : "";
      } else {
        self.genetic_code = self.params.genetic_code || "Universal";
        self.nj = self.params.nj || self.params.tree || "";
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original meme.js constructor
  // block (tree selection preferring usertree, sanitization, output-dir creation
  // BEFORE tree-file write, progress-file creation) that ran before self.init().
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

      if (msa.usertree && msa.usertree.trim()) {
        // Use the usertree if it is populated.
        self.selectedTree = msa.usertree;
      } else {
        logger.warn(
          "MEME job " + self.id + ": Neither usertree nor neighbor-joining tree is available."
        );
      }
      logger.info("MEME job " + self.id + ": Selected tree", {
        tree_content: self.selectedTree
          ? self.selectedTree.length > 100
            ? self.selectedTree.substring(0, 100) + "..."
            : self.selectedTree
          : "null"
      });
    } else {
      logger.warn("MEME job " + self.id + ": self.params.analysis.msa structure is missing.");
    }

    // Sanitize tree node names for Newick compatibility.
    self.selectedTree = utilities.sanitizeTreeNodeNames(self.selectedTree);
    // Sanitize FASTA names to match tree node names.
    if (self.stream && typeof self.stream === "string") {
      self.stream = utilities.sanitizeFastaNames(self.stream);
    }

    // Ensure output directory exists BEFORE writing files.
    logger.info("MEME job " + self.id + ": Ensuring output directory exists at " + self.output_dir);
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file.
    logger.info("MEME job " + self.id + ": Writing tree file to " + self.tree_fn, {
      tree_content: self.selectedTree
        ? self.selectedTree.length > 100
          ? self.selectedTree.substring(0, 100) + "..."
          : self.selectedTree
        : "null"
    });
    fs.writeFile(self.tree_fn, self.selectedTree, function (err) {
      if (err) {
        logger.error("MEME job " + self.id + ": Error writing tree file: " + err.message);
        self.socket.emit("script error", {
          error: "Failed to write tree file: " + err.message
        });
        return;
      }
      logger.info("MEME job " + self.id + ": Tree file written successfully");
    });

    // Ensure the progress file exists.
    logger.info("MEME job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original meme.js order (golden-pinned).
  exportKeys: [
    ["bootstrap", function (self) { return self.bootstrap; }],
    ["resample", function (self) { return self.resample; }],
    ["multiple_hits", function (self) { return self.multiple_hits; }],
    ["site_multihit", function (self) { return self.site_multihit; }],
    ["rates", function (self) { return self.rates; }],
    ["impute_states", function (self) { return self.impute_states; }],
    ["pvalue", function (self) { return self.p_value; }],
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.meme_procs; }]
  ]
};

const meme = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.meme is the constructor.
exports.meme = meme;
exports.descriptor = descriptor;
