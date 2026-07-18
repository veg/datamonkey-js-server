/**
 * BUSTED analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/busted/busted.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 *
 * Quirk: BUSTED emits `analysis_type` in its LOCAL params but NOT in its SLURM
 * --export list (the original hand-written module omitted it there). The
 * exportKeys entry for analysis_type is therefore scoped to "local".
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

// Original busted.js lookup tables + helper (verbatim).
var synSubstitutionVar = {
  "1": "Yes",
  "2": "No",
  "3": "Branch-site"
};

var multihitVar = {
  Default: "None",
  Double: "Double",
  "Double+Triple": "Double+Triple"
};

function boolToYesNo(value) {
  if (value === true || value === "true") return "Yes";
  if (value === false || value === "false") return "No";
  return value; // Return as-is if already a string
}

var descriptor = {
  type: "busted",
  dir: __dirname,
  script: "busted_submit.sh",
  // rfn -> <fn>.BUSTED.json (busted points rfn at its results json, not a short
  // file), pfn -> <fn>.BUSTED.progress, results_fn -> <fn>.BUSTED.json.
  suffixes: { short: "BUSTED.json", results: "BUSTED", progress: "BUSTED" },
  procsKey: "busted_procs",
  walltimeKey: "busted_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original busted.js branches, where every field is read from that single
  // source object.
  fields: function (self, params, src) {
    self.ds_variation = synSubstitutionVar[src.ds_variation] || src.srv || "Yes";
    self.error_protection = boolToYesNo(src.error_protection || src.error_sink || false);
    self.multihit = multihitVar[src.multihit] || src.multiple_hits || "None";
    self.branches = src.branches || "All";
    self.rates = src.rates || 3;
    self.syn_rates = src.syn_rates || 3;
    self.grid_size = src.grid_size || 250;
    self.starting_points = src.starting_points || 1;
    self.save_fit = src.save_fit || "/dev/null";

    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
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
          self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
      } else {
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original busted.js constructor
  // block that ran before self.init(): ensure output dir exists BEFORE writing
  // the tree file, write the tree file, then create the progress file.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "BUSTED job " + self.id + ": Ensuring output directory exists at " + self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file.
    logger.info("BUSTED job " + self.id + ": Writing tree file to " + self.tree_fn, {
      tree_content: self.nwk_tree
        ? self.nwk_tree.length > 100
          ? self.nwk_tree.substring(0, 100) + "..."
          : self.nwk_tree
        : "null"
    });
    fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
      if (err) {
        logger.error("BUSTED job " + self.id + ": Error writing tree file: " + err.message);
        throw err;
      }
      logger.info("BUSTED job " + self.id + ": Tree file written successfully");
    });

    // Ensure the progress file exists.
    logger.info("BUSTED job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original busted.js order (golden-pinned).
  // analysis_type is emitted only in the local params (scope "local").
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["synRateVariation", function (self) { return self.ds_variation; }],
    ["errorProtection", function (self) { return self.error_protection; }],
    ["multihit", function (self) { return self.multihit; }],
    ["branches", function (self) { return self.branches; }],
    ["rates", function (self) { return self.rates; }],
    ["syn_rates", function (self) { return self.syn_rates; }],
    ["grid_size", function (self) { return self.grid_size; }],
    ["starting_points", function (self) { return self.starting_points; }],
    ["save_fit", function (self) { return self.save_fit; }],
    ["analysis_type", function (self) { return self.type; }, { skipInSlurm: true }],
    ["cwd", function () { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.busted_procs || 4; }]
  ]
};

var busted = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.busted is the constructor.
exports.busted = busted;
exports.descriptor = descriptor;
