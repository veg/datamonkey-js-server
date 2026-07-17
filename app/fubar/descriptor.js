/**
 * FUBAR analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/fubar/fubar.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 *
 * FUBAR is a Bayesian method (no bootstrap/resample). Its analysis-specific
 * params are number_of_grid_points and concentration_of_dirichlet_prior; the
 * export order after treemode is genetic_code, analysis_type, cwd, msaid,
 * number_of_grid_points, concentration_of_dirichlet_prior, procs.
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "fubar",
  dir: __dirname,
  script: "fubar.sh",
  suffixes: { short: "fubar", results: "FUBAR", progress: "fubar" },
  procsKey: "fubar_procs",
  walltimeKey: "fubar_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original fubar.js branches.
  fields: function (self, params, src) {
    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
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
          self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
      } else {
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
      }
    }

    // Advanced options (support multiple naming conventions), matching fubar.js.
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
  },

  // Non-checkOnly side effects, reproducing the original fubar.js constructor
  // block (output-dir creation BEFORE tree-file write, tree cleaned via
  // cleanTreeToNewick and written synchronously, progress-file creation) that ran
  // before self.init(). FUBAR cleans the tree rather than sanitizing FASTA.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file (like Contrast-FEL).
    var cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info("FUBAR job " + self.id + ": Writing cleaned tree file to " + self.tree_fn, {
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
      logger.info("FUBAR job " + self.id + ": Tree file written successfully");
    } catch (err) {
      logger.error("FUBAR job " + self.id + ": Error writing tree file: " + err.message);
      throw err;
    }

    // Ensure the progress file exists.
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original fubar.js order (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["number_of_grid_points", function (self) { return self.number_of_grid_points; }],
    ["concentration_of_dirichlet_prior", function (self) { return self.concentration_of_dirichlet_prior; }],
    ["procs", function (self, config) { return config.fubar_procs || 4; }]
  ]
};

var fubar = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.fubar is the constructor.
exports.fubar = fubar;
exports.descriptor = descriptor;
