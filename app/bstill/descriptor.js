/**
 * B-STILL analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/bstill/bstill.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 *
 * B-STILL is a Bayesian FUBAR-variant. Notable quirks reproduced here:
 *   - results_fn uses the FUBAR-inv suffix -> <fn>.FUBAR-inv.json (not "bstill").
 *   - It has five advanced options (number_of_grid_points,
 *     concentration_of_dirichlet_prior, method, ebf, radius_threshold) that the
 *     original resolves AFTER the checkOnly/normal branch via
 *     analysisParams?.X || params.X || ... fallback chains.
 *   - procs/ntasks/walltime fall back to the FUBAR config keys
 *     (config.bstill_procs is unset, so config.fubar_procs governs); hence
 *     procsKey/walltimeKey point at the fubar_* keys and the procs exportKey
 *     preserves the bstill_procs || fubar_procs || 4 chain verbatim.
 *
 * Standard export prefix with no mode asymmetry, so no prefixKeys/skipInSlurm.
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "bstill",
  dir: __dirname,
  script: "bstill.sh",
  // rfn -> <fn>.bstill, pfn -> <fn>.bstill.progress, results_fn -> <fn>.FUBAR-inv.json.
  suffixes: { short: "bstill", results: "FUBAR-inv", progress: "bstill" },
  // config.bstill_procs is unset, so the original falls back to fubar_procs for
  // --ntasks/walltime; point the factory keys at the fubar_* config keys.
  procsKey: "fubar_procs",
  walltimeKey: "fubar_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original bstill.js branches and its trailing advanced-options block.
  fields: function (self, params, src) {
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

    // Advanced options — resolved after the branch in the original, using the
    // analysisParams (`src`) then the raw params fallbacks. In checkOnly the
    // original's analysisParams is undefined, so src falls through to params;
    // guarding src with `src &&` reproduces that (src is params in checkOnly).
    self.number_of_grid_points =
      (src && src.number_of_grid_points) ||
      params.number_of_grid_points ||
      params.grid ||
      20;
    self.concentration_of_dirichlet_prior =
      (src && src.concentration_of_dirichlet_prior) ||
      params.concentration_of_dirichlet_prior ||
      params.concentration_parameter ||
      0.5;
    self.method = (src && src.method) || params.method || "Variational-Bayes";
    self.ebf = (src && src.ebf) || params.ebf || 10;
    self.radius_threshold = (src && src.radius_threshold) || params.radius_threshold || 0.5;
  },

  // Non-checkOnly side effects, reproducing the original bstill.js constructor
  // block that ran before self.init(): ensure output dir exists BEFORE writing
  // the tree file, clean the tree via cleanTreeToNewick and write it
  // synchronously, then create the progress file.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file.
    var cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info("B-STILL job " + self.id + ": Writing cleaned tree file to " + self.tree_fn, {
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
      logger.info("B-STILL job " + self.id + ": Tree file written successfully");
    } catch (err) {
      logger.error("B-STILL job " + self.id + ": Error writing tree file: " + err.message);
      throw err;
    }

    // Ensure the progress file exists.
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original bstill.js order (golden-pinned).
  // Identical in both slurm and local, so no scoped entries.
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function () { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["number_of_grid_points", function (self) { return self.number_of_grid_points; }],
    ["concentration_of_dirichlet_prior", function (self) { return self.concentration_of_dirichlet_prior; }],
    ["method", function (self) { return self.method; }],
    ["ebf", function (self) { return self.ebf; }],
    ["radius_threshold", function (self) { return self.radius_threshold; }],
    ["procs", function (self, config) { return config.bstill_procs || config.fubar_procs || 4; }]
  ]
};

var bstill = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.bstill is the constructor.
exports.bstill = bstill;
exports.descriptor = descriptor;
