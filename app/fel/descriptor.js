/**
 * FEL analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/fel/fel.js job-submission params exactly
 * (pinned by test/golden/qsub-params.js).
 */

var factory = require("../../lib/analysis-factory.js");

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
