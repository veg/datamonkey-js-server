/**
 * Contrast-FEL (cfel) analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/contrast-fel/cfel.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 *
 * Quirks (field resolution / transforms, NOT export structure):
 *  - branch_sets: an array is joined with ":" (a string is passed through).
 *  - rate_variation: srv || (ds_variation == 1 ? "Yes" : "No") || "Yes".
 *  - p_value/q_value defaults 0.05 / 0.20; permutations default "Yes".
 *  - #395: Contrast-FEL requires >=2 branch groups; if fewer are provided we do
 *    NOT submit (no self.init()) — we write "Error" to the status file and emit a
 *    "script error" instead. Reproduced verbatim below by suppressing init.
 *
 * Standard export prefix (fn tree_fn sfn pfn rfn treemode), no mode asymmetry:
 * no prefixKeys / skipInSlurm needed.
 */

const factory = require("../../lib/analysis-factory.js");
const fs = require("fs");
const utilities = require("../../lib/utilities");
const logger = require("../../lib/logger").logger;

const descriptor = {
  type: "cfel",
  dir: __dirname,
  script: "cfel.sh",
  // results_short (rfn) -> <fn>.cfel, results_fn -> <fn>.FEL.json,
  // progress_fn -> <fn>.cfel.progress.
  suffixes: { short: "cfel", results: "FEL", progress: "cfel" },
  procsKey: "cfel_procs",
  walltimeKey: "cfel_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original cfel.js branches.
  fields: function (self, params, src) {
    const isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
      const rawBranchSets = params["branch-set"] || params.branch_sets || "";
      self.branch_sets = Array.isArray(rawBranchSets) ? rawBranchSets.join(":") : rawBranchSets;
      self.rate_variation = params.srv || (params.ds_variation == 1 ? "Yes" : "No") || "Yes";
      self.permutations = params.permutations || "Yes";
      self.p_value = params.p_value || params.pvalue || 0.05;
      self.q_value = params.q_value || params.qvalue || 0.2;
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
          self.params.analysis.tagged_nwk_tree ||
          self.params.nwk_tree ||
          self.params.tree ||
          "";
        const rawBranchSetsA =
          self.params.analysis["branch-set"] ||
          self.params.analysis.branch_sets ||
          src["branch-set"] ||
          src.branch_sets ||
          "";
        self.branch_sets = Array.isArray(rawBranchSetsA)
          ? rawBranchSetsA.join(":")
          : rawBranchSetsA;
        self.rate_variation =
          src.srv || (self.params.analysis.ds_variation == 1 ? "Yes" : "No") || "Yes";
        self.permutations = src.permutations || "Yes";
        self.p_value = src.p_value || src.pvalue || 0.05;
        self.q_value = src.q_value || src.qvalue || 0.2;
      } else {
        self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
        const rawBranchSetsB = self.params["branch-set"] || self.params.branch_sets || "";
        self.branch_sets = Array.isArray(rawBranchSetsB)
          ? rawBranchSetsB.join(":")
          : rawBranchSetsB;
        self.rate_variation =
          self.params.srv || (self.params.ds_variation == 1 ? "Yes" : "No") || "Yes";
        self.permutations = self.params.permutations || "Yes";
        self.p_value = self.params.p_value || self.params.pvalue || 0.05;
        self.q_value = self.params.q_value || self.params.qvalue || 0.2;
      }
    }
  },

  // Non-checkOnly side effects, reproducing the original cfel.js constructor
  // block that ran before self.init(): ensure the output dir exists FIRST, then
  // clean the tree and write it, then create the progress file. Finally, the
  // #395 guard: Contrast-FEL requires >=2 branch groups — if fewer are provided
  // we suppress submission (skip self.init()) by overriding self.init to a no-op,
  // matching the original module's early `return` before self.init().
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "Contrast-FEL job " + self.id + ": Ensuring output directory exists at " + self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file.
    const cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info("Contrast-FEL job " + self.id + ": Writing cleaned tree file to " + self.tree_fn, {
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
      logger.info("Contrast-FEL job " + self.id + ": Tree file written successfully");
    } catch (err) {
      logger.error("Contrast-FEL job " + self.id + ": Error writing tree file: " + err.message);
      throw err;
    }

    // Ensure the progress file exists.
    logger.info("Contrast-FEL job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");

    // #395: require at least two branch groups to compare. If fewer, do NOT
    // submit — the factory always calls self.init() after beforeInit, so we
    // suppress it here by replacing init with a no-op (mirrors the original
    // module's early return).
    const _cfelSetCount = String(self.branch_sets == null ? "" : self.branch_sets)
      .split(":")
      .filter(function (s) {
        return s.trim().length;
      }).length;
    if (_cfelSetCount < 2) {
      const _cfelMsg =
        "Contrast-FEL requires at least two branch groups to compare, but " +
        _cfelSetCount +
        " were provided. Please tag a second group of branches in the tree and resubmit.";
      logger.error("Contrast-FEL job " + self.id + ": " + _cfelMsg);
      try {
        fs.writeFileSync(self.status_fn, "Error");
      } catch (e) {}
      if (self.socket) {
        self.socket.emit("script error", { error: _cfelMsg });
      }
      // Suppress submission: nothing is submitted (no self.init()).
      self.init = function () {};
    }
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original cfel.js order (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["branch_sets", function (self) { return self.branch_sets; }],
    ["rate_variation", function (self) { return self.rate_variation; }],
    ["permutations", function (self) { return self.permutations; }],
    ["p_value", function (self) { return self.p_value; }],
    ["q_value", function (self) { return self.q_value; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function () { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.cfel_procs; }]
  ]
};

const cfel = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.cfel is the constructor.
exports.cfel = cfel;
exports.descriptor = descriptor;
