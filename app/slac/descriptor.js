/**
 * SLAC analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/slac/slac.js job-submission params exactly
 * (pinned by test/golden/qsub-params.js).
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "slac",
  dir: __dirname,
  script: "slac.sh",
  suffixes: { short: "slac", results: "SLAC", progress: "slac" },
  procsKey: "slac_procs",
  walltimeKey: "slac_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original slac.js branches.
  fields: function (self, params, src, ctx) {
    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || params.code || "Universal";
      self.branches = params.branches || "All";
      self.samples = params.samples || 100;
      self.p_value = params.p_value || params.pvalue || 0.1;
      self.nj = "";
    } else {
      if (self.params.msa) {
        self.genetic_code = self.params.msa[0]
          ? ctx.code[self.params.msa[0].gencodeid + 1]
          : "Universal";
        self.nj = self.params.msa[0] ? self.params.msa[0].nj : "";
      } else {
        self.genetic_code = self.params.genetic_code || self.params.code || "Universal";
        self.nj = self.params.nj || self.params.tree || "";
      }
      self.branches = self.params.branches || "All";
      self.samples = self.params.samples || 100;
      self.p_value = self.params.p_value || self.params.pvalue || 0.1;
    }
  },

  // Non-checkOnly side effects, reproducing the original slac.js constructor
  // block (tree selection preferring usertree, sanitization, tree-file write,
  // output-dir creation, progress-file creation) that ran before self.init().
  beforeInit: function (self) {
    // Determine the tree to use — prefer usertree over NJ tree.
    self.selectedTree = self.nj;

    if (
      self.params &&
      self.params.analysis &&
      self.params.analysis.msa &&
      typeof self.params.analysis.msa === "object"
    ) {
      var msa = self.params.analysis.msa[0];

      if (msa && msa.usertree && msa.usertree.trim()) {
        self.selectedTree = msa.usertree;
      }
    }

    // Sanitize tree node names for Newick compatibility.
    self.selectedTree = utilities.sanitizeTreeNodeNames(self.selectedTree);
    // Sanitize FASTA names to match tree node names.
    if (self.stream && typeof self.stream === "string") {
      self.stream = utilities.sanitizeFastaNames(self.stream);
    }

    // Write tree to a file.
    logger.info("SLAC job " + self.id + ": Writing tree file to " + self.tree_fn, {
      tree_content: self.selectedTree
        ? self.selectedTree.length > 100
          ? self.selectedTree.substring(0, 100) + "..."
          : self.selectedTree
        : "null"
    });
    fs.writeFile(self.tree_fn, self.selectedTree, function (err) {
      if (err) {
        logger.error("SLAC job " + self.id + ": Error writing tree file: " + err.message);
        self.socket.emit("script error", {
          error: "Failed to write tree file: " + err.message
        });
        return;
      }
      logger.info("SLAC job " + self.id + ": Tree file written successfully");
    });

    // Ensure output directory exists.
    logger.info("SLAC job " + self.id + ": Ensuring output directory exists at " + self.output_dir);
    utilities.ensureDirectoryExists(self.output_dir);

    // Ensure the progress file exists.
    logger.info("SLAC job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original slac.js order (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["analysis_type", function (self) { return self.type; }],
    ["branches", function (self) { return self.branches; }],
    ["samples", function (self) { return self.samples; }],
    ["pvalue", function (self) { return self.p_value; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.slac_procs; }]
  ]
};

var slac = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.slac is the constructor.
exports.slac = slac;
exports.descriptor = descriptor;
