/**
 * RELAX analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/relax/relax.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 *
 * NOTE: relax's original module omits the rfn/results_short export key entirely,
 * so this descriptor sets prefixKeys (no rfn). Its progress/results files use the
 * uppercase "RELAX" suffix (self.fn + ".RELAX.progress" / ".RELAX.json").
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "relax",
  dir: __dirname,
  script: "relax.sh",
  // relax has no results_short (rfn) export; short is unused; prefixKeys omits rfn.
  // progress/results use the uppercase "RELAX" suffix.
  suffixes: { short: "relax", results: "RELAX", progress: "RELAX" },
  // relax omits the rfn (results_short) key from its param prefix.
  prefixKeys: ["fn", "tree_fn", "sfn", "pfn", "treemode"],
  procsKey: "relax_procs",
  walltimeKey: "relax_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original relax.js branches.
  fields: function (self, params, src) {
    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
      self.mode = params.mode || "Classic mode";
      self.test_branches = params.test || params.test_branches || "TEST";
      self.reference_branches =
        params.reference || params.reference_branches || "REFERENCE";
      self.models = params.models || params.analysis_type || "All";
      self.rates = params.rates || params.omega_rate_classes || 3;
      self.kill_zero_lengths = params.kill_zero_lengths || "No";
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
        self.mode = src.mode || "Classic mode";
        self.test_branches = src.test || src.test_branches || "TEST";
        self.reference_branches =
          src.reference || src.reference_branches || "REFERENCE";
        self.models = src.models || src.analysis_type || "All";
        self.rates = src.rates || src.omega_rate_classes || 3;
        self.kill_zero_lengths = src.kill_zero_lengths || "No";
        self.nwk_tree =
          self.params.analysis.tagged_nwk_tree ||
          self.params.nwk_tree ||
          self.params.tree ||
          "";
      } else {
        self.mode = self.params.mode || "Classic mode";
        self.test_branches = self.params.test || self.params.test_branches || "TEST";
        self.reference_branches =
          self.params.reference || self.params.reference_branches || "REFERENCE";
        self.models = self.params.models || self.params.analysis_type || "All";
        self.rates = self.params.rates || self.params.omega_rate_classes || 3;
        self.kill_zero_lengths = self.params.kill_zero_lengths || "No";
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original relax.js constructor
  // block that ran before self.init(): ensure the output dir exists FIRST, then
  // write the tree file, then create the progress and status files.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "RELAX job " + self.id + ": Ensuring output directory exists at " + self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file.
    logger.info("RELAX job " + self.id + ": Writing tree file to " + self.tree_fn, {
      tree_content: self.nwk_tree
        ? self.nwk_tree.length > 100
          ? self.nwk_tree.substring(0, 100) + "..."
          : self.nwk_tree
        : "null"
    });
    fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
      if (err) {
        logger.error("RELAX job " + self.id + ": Error writing tree file: " + err.message);
        throw err;
      }
      logger.info("RELAX job " + self.id + ": Tree file written successfully");
    });

    // Ensure the progress and status files exist.
    logger.info("RELAX job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
    fs.openSync(self.status_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/treemode prefix
  // (relax has NO rfn) — exactly matching the original relax.js order
  // (golden-pinned). relax has no analysis_type export key.
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["mode", function (self) { return self.mode; }],
    ["test_branches", function (self) { return self.test_branches; }],
    ["reference_branches", function (self) { return self.reference_branches; }],
    ["models", function (self) { return self.models; }],
    ["rates", function (self) { return self.rates; }],
    ["kill_zero_lengths", function (self) { return self.kill_zero_lengths; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.relax_procs; }]
  ]
};

var relax = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.relax is the constructor.
exports.relax = relax;
exports.descriptor = descriptor;
