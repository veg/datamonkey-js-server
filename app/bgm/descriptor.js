/**
 * BGM analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/bgm/bgm.js job-submission params exactly
 * (pinned by test/golden/qsub-params.snapshot.json).
 */

const factory = require("../../lib/analysis-factory.js");
const fs = require("fs");
const utilities = require("../../lib/utilities");
const logger = require("../../lib/logger").logger;
const code = require("../code").code;
const model = require("../model").model;

const datatypes = {
  "1": "nucleotide",
  "2": "amino-acid",
  "3": "codon"
};

const descriptor = {
  type: "bgm",
  dir: __dirname,
  script: "bgm.sh",
  suffixes: { short: "bgm", results: "BGM", progress: "bgm" },
  procsKey: "bgm_procs",
  walltimeKey: "bgm_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original bgm.js branches.
  fields: function (self, params, src) {
    const isCheckOnly = params.checkOnly || false;

    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
      self.datatype = params.datatype || params.type || "codon";
      self.substitution_model = params.substitution_model || params.baseline_model || null;
      self.length_of_each_chain = params.length_of_each_chain || params.steps || 1000000;
      self.number_of_burn_in_samples = params.number_of_burn_in_samples || params.burn_in || 100000;
      self.number_of_samples = params.number_of_samples || params.samples || 100;
      self.maximum_parents_per_node = parseInt(params.maximum_parents_per_node || params.max_parents || 1);
      self.minimum_subs_per_site = parseInt(params.minimum_subs_per_site || params.min_subs || 1);
      self.branches = params.branches || "All";
      self.nwk_tree = params.nwk_tree || params.tree || "";
    } else {
      const analysisParams = self.params.analysis || self.params;

      if (self.params.msa) {
        self.genetic_code = self.params.msa[0]
          ? code[self.params.msa[0].gencodeid + 1]
          : "Universal";
        self.nwk_tree = self.params.msa[0] ? self.params.msa[0].nj : "";
        self.datatype = self.params.msa[0] ? datatypes[self.params.msa[0].datatype] : "codon";
      } else {
        self.genetic_code = self.params.genetic_code || "Universal";
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
        self.datatype = self.params.datatype || self.params.type || "codon";
      }

      if (self.params.analysis) {
        self.substitution_model = self.params.analysis.substitution_model
          ? model[self.params.analysis.substitution_model]
          : (analysisParams.baseline_model || null);
        self.length_of_each_chain = analysisParams.length_of_each_chain || analysisParams.steps || 1000000;
        self.number_of_burn_in_samples = analysisParams.number_of_burn_in_samples || analysisParams.burn_in || 100000;
        self.number_of_samples = analysisParams.number_of_samples || analysisParams.samples || 100;
        self.maximum_parents_per_node = parseInt(analysisParams.maximum_parents_per_node || analysisParams.max_parents || 1);
        self.minimum_subs_per_site = parseInt(analysisParams.minimum_subs_per_site || analysisParams.min_subs || 1);
        self.branches = analysisParams.branches || "All";
      } else {
        self.substitution_model = self.params.substitution_model
          ? model[self.params.substitution_model]
          : (self.params.baseline_model || null);
        self.length_of_each_chain = self.params.length_of_each_chain || self.params.steps || 1000000;
        self.number_of_burn_in_samples = self.params.number_of_burn_in_samples || self.params.burn_in || 100000;
        self.number_of_samples = self.params.number_of_samples || self.params.samples || 100;
        self.maximum_parents_per_node = parseInt(self.params.maximum_parents_per_node || self.params.max_parents || 1);
        self.minimum_subs_per_site = parseInt(self.params.minimum_subs_per_site || self.params.min_subs || 1);
        self.branches = self.params.branches || "All";
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original bgm.js constructor
  // block (output-dir creation, cleaned-tree write, progress-file creation)
  // that ran before self.init(). Order matches the original exactly.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info("BGM job " + self.id + ": Ensuring output directory exists at " + self.output_dir);
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file.
    const cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info("BGM job " + self.id + ": Writing cleaned tree file to " + self.tree_fn, {
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
      logger.info("BGM job " + self.id + ": Tree file written successfully");
    } catch (err) {
      logger.error("BGM job " + self.id + ": Error writing tree file: " + err.message);
      throw err;
    }

    // Ensure the progress file exists.
    logger.info("BGM job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original bgm.js order (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["datatype", function (self) { return self.datatype; }],
    ["substitution_model", function (self) { return self.substitution_model || ""; }],
    ["branches", function (self) { return self.branches; }],
    ["length_of_each_chain", function (self) { return self.length_of_each_chain; }],
    ["number_of_burn_in_samples", function (self) { return self.number_of_burn_in_samples; }],
    ["number_of_samples", function (self) { return self.number_of_samples; }],
    ["maximum_parents_per_node", function (self) { return self.maximum_parents_per_node; }],
    ["minimum_subs_per_site", function (self) { return self.minimum_subs_per_site; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.bgm_procs; }]
  ]
};

const bgm = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.bgm is the constructor.
exports.bgm = bgm;
exports.descriptor = descriptor;
