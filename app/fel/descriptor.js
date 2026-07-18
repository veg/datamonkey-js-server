/**
 * FEL analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/fel/fel.js job-submission params exactly
 * (pinned by test/golden/qsub-params.js).
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "fel",
  dir: __dirname,
  script: "fel.sh",
  suffixes: { short: "fel", results: "FEL", progress: "fel" },
  procsKey: "fel_procs",
  walltimeKey: "fel_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original fel.js branches.
  fields: function (self, params, src) {
    self.multiple_hits = src.multiple_hits || "None";
    self.site_multihit = src.site_multihit || "Estimate";
    self.branches = src.branches || "All";
    self.bootstrap = src.bootstrap || false;
    self.resample = src.resample || 1;

    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
      self.rate_variation = "No";
      self.ci = "No";
      self.nwk_tree = params.nwk_tree || params.tree || "";
    } else {
      if (self.params.msa) {
        self.genetic_code = self.params.msa[0]
          ? require("../code").code[self.params.msa[0].gencodeid + 1]
          : "Universal";
      } else {
        self.genetic_code = self.params.genetic_code || "Universal";
      }
      if (self.params.analysis) {
        self.nwk_tree =
          self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree;
        self.rate_variation = self.params.analysis.ds_variation == 1 ? "Yes" : "No";
        self.ci = self.params.analysis.ci == true ? "Yes" : "No";
      } else {
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
        self.rate_variation = self.params.rate_variation || "No";
        self.ci = self.params.ci || "No";
      }
    }
  },

  // The {FG} tagged-tree special case.
  afterFields: function (self) {
    if (self.nwk_tree && self.nwk_tree.indexOf("{FG}") !== -1 && self.branches === "All") {
      self.branches = "FG";
    }
  },

  // Non-checkOnly side effects, reproducing the original fel.js constructor
  // block (tree/FASTA sanitization, tree-file write, output-dir creation,
  // progress-file creation) that ran before self.init().
  beforeInit: function (self) {
    // Sanitize tree node names for Newick compatibility.
    self.nwk_tree = utilities.sanitizeTreeNodeNames(self.nwk_tree);
    // Sanitize FASTA names to match tree node names.
    if (self.stream && typeof self.stream === "string") {
      self.stream = utilities.sanitizeFastaNames(self.stream);
    }

    // Write tree to a file.
    logger.info("FEL job " + self.id + ": Writing tree file to " + self.tree_fn, {
      tree_content: self.nwk_tree
        ? self.nwk_tree.length > 100
          ? self.nwk_tree.substring(0, 100) + "..."
          : self.nwk_tree
        : "null"
    });
    fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
      if (err) {
        logger.error("FEL job " + self.id + ": Error writing tree file: " + err.message);
        throw err;
      }
      logger.info("FEL job " + self.id + ": Tree file written successfully");
    });

    // Ensure output directory exists.
    logger.info("FEL job " + self.id + ": Ensuring output directory exists at " + self.output_dir);
    utilities.ensureDirectoryExists(self.output_dir);

    // Ensure the progress file exists.
    logger.info("FEL job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original fel.js order (golden-pinned).
  exportKeys: [
    ["bootstrap", function (self) { return self.bootstrap; }],
    ["resample", function (self) { return self.resample; }],
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["analysis_type", function (self) { return self.type; }],
    ["rate_variation", function (self) { return self.rate_variation; }],
    ["ci", function (self) { return self.ci; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.fel_procs; }],
    ["multiple_hits", function (self) { return self.multiple_hits; }],
    ["site_multihit", function (self) { return self.site_multihit; }],
    ["branches", function (self) { return self.branches; }]
  ]
};

var fel = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.fel is the constructor.
exports.fel = fel;
exports.descriptor = descriptor;
