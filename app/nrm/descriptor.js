/**
 * NRM analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/nrm/nrm.js job-submission params exactly
 * (pinned by test/golden/qsub-params.js).
 *
 * NOTE ON rfn: unlike most analyses, nrm.js sets rfn to self.results_fn (the
 * "<fn>.NRM.json" full results path), NOT self.results_short_fn. The factory's
 * default prefix rfn maps to results_short_fn, so we drop rfn from prefixKeys
 * and re-emit it (and treemode) as the leading exportKeys, preserving the exact
 * fn/tree_fn/sfn/pfn/rfn/treemode order while pointing rfn at results_fn.
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "nrm",
  dir: __dirname,
  script: "nrm.sh",
  suffixes: { short: "nrm", results: "NRM", progress: "nrm" },
  procsKey: "nrm_procs",
  walltimeKey: "nrm_walltime",

  // Drop rfn from the common prefix — nrm re-emits it (pointing at results_fn)
  // plus treemode as the leading exportKeys to keep byte-identical ordering.
  prefixKeys: ["fn", "tree_fn", "sfn", "pfn"],

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original nrm.js branches.
  fields: function (self, params, src) {
    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
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
          self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
        self.branches = src.branches || "All";
      } else {
        self.branches = self.params.branches || "All";
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original nrm.js constructor
  // block (output-dir creation, tree-file write, progress-file creation) that
  // ran before self.init(). Order matches the original exactly.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "NRM job " + self.id + ": Ensuring output directory exists at " + self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file.
    var cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info("NRM job " + self.id + ": Writing cleaned tree file to " + self.tree_fn, {
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
      logger.info("NRM job " + self.id + ": Tree file written successfully");
    } catch (err) {
      logger.error("NRM job " + self.id + ": Error writing tree file: " + err.message);
      throw err;
    }

    // Ensure the progress file exists.
    logger.info("NRM job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn prefix — exactly
  // matching the original nrm.js order (golden-pinned). rfn points at
  // results_fn (not results_short_fn) and leads, followed by treemode, matching
  // the original prefix layout.
  exportKeys: [
    ["rfn", function (self) { return self.results_fn; }],
    ["treemode", function (self) { return self.treemode; }],
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["branches", function (self) { return self.branches; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.nrm_procs || 4; }]
  ]
};

var nrm = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.nrm is the constructor.
exports.nrm = nrm;
exports.descriptor = descriptor;
