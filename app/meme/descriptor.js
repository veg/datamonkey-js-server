/**
 * MEME analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/meme/meme.js job-submission params exactly
 * (pinned by test/golden/qsub-params.snapshot.json).
 */

var factory = require("../../lib/analysis-factory.js");

var descriptor = {
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

    var isCheckOnly = params.checkOnly || false;
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

var meme = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.meme is the constructor.
exports.meme = meme;
exports.descriptor = descriptor;
