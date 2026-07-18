/**
 * MultiHit analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/multihit/multihit.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 *
 * Uses the standard export prefix (fn/tree_fn/sfn/pfn/rfn/treemode) with no mode
 * asymmetry, so no prefixKeys / skipInSlurm are needed. The MultiHit-specific
 * fields are the multiple/triple hit rate params (rate_classes, triple_islands).
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "multihit",
  dir: __dirname,
  script: "multihit.sh",
  // The original multihit.js points rfn at self.results_fn (<fn>.MULTI.json),
  // NOT the short file, so `short` uses the MULTI.json suffix to match golden.
  // results_fn -> <fn>.MULTI.json, progress -> <fn>.multihit.progress.
  suffixes: { short: "MULTI.json", results: "MULTI", progress: "multihit" },
  procsKey: "multihit_procs",
  walltimeKey: "multihit_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original multihit.js branches.
  fields: function (self, params, src) {
    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
      self.rate_classes = params.rate_classes || params.rates || 1;
      self.triple_islands = params.triple_islands || "No";
      self.branches = params.branches || "All";
      self.nwk_tree = params.nwk_tree || params.tree || "";
    } else {
      if (self.params.msa) {
        self.genetic_code = self.params.msa[0]
          ? require("../code").code[self.params.msa[0].gencodeid + 1]
          : "Universal";
        self.nwk_tree = self.params.msa[0]
          ? self.params.msa[0].usertree || self.params.msa[0].nj
          : "";
        if (self.params.analysis && self.params.analysis.tagged_nwk_tree) {
          self.nwk_tree = self.params.analysis.tagged_nwk_tree;
        }
      } else {
        self.genetic_code = self.params.genetic_code || "Universal";
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
      }

      if (self.params.analysis) {
        self.nwk_tree =
          self.params.analysis.tagged_nwk_tree ||
          self.params.nwk_tree ||
          self.params.tree ||
          "";
        self.rate_classes = src.rate_classes || src.rates || 1;
        self.triple_islands = src.triple_islands || "No";
        self.branches = src.branches || "All";
      } else {
        self.rate_classes = self.params.rate_classes || self.params.rates || 1;
        self.triple_islands = self.params.triple_islands || "No";
        self.branches = self.params.branches || "All";
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original multihit.js constructor
  // block that ran before self.init(): ensure the output dir exists FIRST, then
  // write the cleaned tree file (sync), then create the progress file.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "MultiHit job " + self.id + ": Ensuring output directory exists at " + self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file.
    var cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info("MultiHit job " + self.id + ": Writing cleaned tree file to " + self.tree_fn, {
      original_length: self.nwk_tree ? self.nwk_tree.length : 0,
      cleaned_length: cleanTree ? cleanTree.length : 0,
      tree_preview: cleanTree
        ? cleanTree.length > 100
          ? cleanTree.substring(0, 100) + "..."
          : cleanTree
        : "null"
    });
    try {
      fs.writeFileSync(self.tree_fn, cleanTree);
      logger.info("MultiHit job " + self.id + ": Tree file written successfully");
    } catch (err) {
      logger.error("MultiHit job " + self.id + ": Error writing tree file: " + err.message);
      throw err;
    }

    // Ensure the progress file exists.
    logger.info("MultiHit job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original multihit.js order (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["rate_classes", function (self) { return self.rate_classes; }],
    ["triple_islands", function (self) { return self.triple_islands; }],
    ["branches", function (self) { return self.branches; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function () { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.multihit_procs || 4; }]
  ]
};

var multihit = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.multihit is the constructor.
exports.multihit = multihit;
exports.descriptor = descriptor;
