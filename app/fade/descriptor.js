/**
 * FADE analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/fade/fade.js job-submission params exactly
 * (pinned by test/golden/qsub-params.snapshot.json).
 *
 * Quirks (verbatim from the original module):
 *   - substitution_model resolves via a `model[]` lookup table (../model), with
 *     an ".model" fallback and default "LG".
 *   - posterior_estimation_method resolves via a local estimationMethod lookup
 *     ({1:"Metropolis-Hastings",2:"Collapsed-Gibbs",3:"Variational-Bayes"}), with
 *     a ".method" fallback and default "Metropolis-Hastings".
 *   - genetic_code resolves via code[gencodeid+1] (../code) in the msa branch.
 * FADE uses the STANDARD export prefix (fn tree_fn sfn pfn rfn treemode) with no
 * mode asymmetry, so it needs no prefixKeys or skipInSlurm.
 */

const factory = require("../../lib/analysis-factory.js");
const fs = require("fs");
const utilities = require("../../lib/utilities");
const logger = require("../../lib/logger").logger;
const model = require("../model").model;
const code = require("../code").code;

// Original fade.js lookup table (verbatim).
const estimationMethod = {
  "1": "Metropolis-Hastings",
  "2": "Collapsed-Gibbs",
  "3": "Variational-Bayes"
};

const descriptor = {
  type: "fade",
  dir: __dirname,
  script: "fade.sh",
  suffixes: { short: "fade", results: "FADE", progress: "fade" },
  procsKey: "fade_procs",
  walltimeKey: "fade_walltime",

  // Set analysis-specific self.<field> values, reproducing the original fade.js
  // three-way branch (checkOnly / normal-with-analysis / normal-without-analysis)
  // verbatim.
  fields: function (self, params) {
    const isCheckOnly = params.checkOnly || false;

    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
      self.substitution_model =
        (params.substitution_model && model[params.substitution_model]) ||
        params.model ||
        "LG";
      self.posterior_estimation_method =
        (params.posterior_estimation_method &&
          estimationMethod[params.posterior_estimation_method]) ||
        params.method ||
        "Metropolis-Hastings";
      self.branches = params.branches || "All";
      self.number_of_grid_points =
        params.number_of_grid_points || params.grid || 20;
      self.number_of_mcmc_chains =
        params.number_of_mcmc_chains || params.chains || 5;
      self.length_of_each_chain =
        params.length_of_each_chain || params.chain_length || 1000000;
      self.number_of_burn_in_samples =
        params.number_of_burn_in_samples || params.burn_in || 100000;
      self.number_of_samples = params.number_of_samples || params.samples || 100;
      self.concentration_of_dirichlet_prior =
        params.concentration_of_dirichlet_prior ||
        params.concentration_parameter ||
        0.5;
      self.nwk_tree = params.nwk_tree || params.tree || "";
    } else {
      const analysisParams = self.params.analysis || self.params;

      // parameter attributes with fallbacks
      if (self.params.msa) {
        self.genetic_code = self.params.msa[0]
          ? code[self.params.msa[0].gencodeid + 1]
          : "Universal";
        self.nwk_tree = self.params.msa[0] ? self.params.msa[0].nj : "";
        // Use analysis.tagged_nwk_tree if available (for unified format)
        if (self.params.analysis && self.params.analysis.tagged_nwk_tree) {
          self.nwk_tree = self.params.analysis.tagged_nwk_tree;
        }
      } else {
        self.genetic_code = self.params.genetic_code || "Universal";
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
      }

      if (self.params.analysis) {
        // Use FEL-style tree assignment for unified format compatibility
        self.nwk_tree =
          self.params.analysis.tagged_nwk_tree ||
          self.params.nwk_tree ||
          self.params.tree ||
          "";
        // FADE specific attributes with complete parameter coverage
        self.substitution_model =
          (self.params.analysis.substitution_model &&
            model[self.params.analysis.substitution_model]) ||
          analysisParams.model ||
          "LG";
        self.posterior_estimation_method =
          (self.params.analysis.posterior_estimation_method &&
            estimationMethod[self.params.analysis.posterior_estimation_method]) ||
          analysisParams.method ||
          "Metropolis-Hastings";
        self.branches = analysisParams.branches || "All";
        self.number_of_grid_points =
          analysisParams.number_of_grid_points || analysisParams.grid || 20;
        self.number_of_mcmc_chains =
          analysisParams.number_of_mcmc_chains || analysisParams.chains || 5;
        self.length_of_each_chain =
          analysisParams.length_of_each_chain ||
          analysisParams.chain_length ||
          1000000;
        self.number_of_burn_in_samples =
          analysisParams.number_of_burn_in_samples ||
          analysisParams.burn_in ||
          100000;
        self.number_of_samples =
          analysisParams.number_of_samples || analysisParams.samples || 100;
        self.concentration_of_dirichlet_prior =
          analysisParams.concentration_of_dirichlet_prior ||
          analysisParams.concentration_parameter ||
          0.5;
      } else {
        // FADE specific attributes with complete parameter coverage
        self.substitution_model =
          (self.params.substitution_model &&
            model[self.params.substitution_model]) ||
          self.params.model ||
          "LG";
        self.posterior_estimation_method =
          (self.params.posterior_estimation_method &&
            estimationMethod[self.params.posterior_estimation_method]) ||
          self.params.method ||
          "Metropolis-Hastings";
        self.branches = self.params.branches || "All";
        self.number_of_grid_points =
          self.params.number_of_grid_points || self.params.grid || 20;
        self.number_of_mcmc_chains =
          self.params.number_of_mcmc_chains || self.params.chains || 5;
        self.length_of_each_chain =
          self.params.length_of_each_chain ||
          self.params.chain_length ||
          1000000;
        self.number_of_burn_in_samples =
          self.params.number_of_burn_in_samples ||
          self.params.burn_in ||
          100000;
        self.number_of_samples =
          self.params.number_of_samples || self.params.samples || 100;
        self.concentration_of_dirichlet_prior =
          self.params.concentration_of_dirichlet_prior ||
          self.params.concentration_parameter ||
          0.5;
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original fade.js constructor
  // block that ran before self.init(): ensure the output dir exists FIRST, then
  // write the cleaned tree file, then create the progress file.
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "FADE job " + self.id + ": Ensuring output directory exists at " + self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file.
    const cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info("FADE job " + self.id + ": Writing cleaned tree file to " + self.tree_fn, {
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
      logger.info("FADE job " + self.id + ": Tree file written successfully");
    } catch (err) {
      logger.error("FADE job " + self.id + ": Error writing tree file: " + err.message);
      throw err;
    }

    // Ensure the progress file exists.
    logger.info("FADE job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original fade.js order (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["substitution_model", function (self) { return self.substitution_model; }],
    ["posterior_estimation_method", function (self) { return self.posterior_estimation_method; }],
    ["branches", function (self) { return self.branches; }],
    ["number_of_grid_points", function (self) { return self.number_of_grid_points; }],
    ["number_of_mcmc_chains", function (self) { return self.number_of_mcmc_chains; }],
    ["length_of_each_chain", function (self) { return self.length_of_each_chain; }],
    ["number_of_burn_in_samples", function (self) { return self.number_of_burn_in_samples; }],
    ["number_of_samples", function (self) { return self.number_of_samples; }],
    ["concentration_of_dirichlet_prior", function (self) { return self.concentration_of_dirichlet_prior; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function () { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.fade_procs || 4; }]
  ]
};

const fade = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.fade is the constructor.
exports.fade = fade;
exports.descriptor = descriptor;
