/**
 * PRIME analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/prime/prime.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 *
 * Note: PRIME does NOT emit a treemode key in its export string, so the
 * descriptor sets omitTreemode.
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "prime",
  dir: __dirname,
  script: "prime.sh",
  suffixes: { short: "prime", results: "PRIME", progress: "prime" },
  procsKey: "prime_procs",
  walltimeKey: "prime_walltime",
  // PRIME's original qsub_params never included treemode.
  omitTreemode: true,

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original prime.js branches (both branches read the same fields from
  // their respective source object, with the same "property-set"/"impute-states"
  // hyphenated fallbacks).
  fields: function (self, params, src) {
    self.property_set = src.property_set || src["property-set"] || "5PROP";
    self.pvalue = src.pvalue || 0.1;
    self.impute_states = src.impute_states || src["impute-states"] || "No";
    self.branches = src.branches || "All";

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

  // Non-checkOnly side effects, reproducing the original prime.js constructor
  // block (tree selection preferring usertree, output-dir creation BEFORE
  // tree-file write, progress-file creation) that ran before self.init().
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

      if (msa.usertree && msa.usertree.trim()) {
        self.selectedTree = msa.usertree;
      } else {
        logger.warn(
          "PRIME job " + self.id + ": Neither usertree nor neighbor-joining tree is available."
        );
      }
      logger.info("PRIME job " + self.id + ": Selected tree", {
        tree_content: self.selectedTree
          ? self.selectedTree.length > 100
            ? self.selectedTree.substring(0, 100) + "..."
            : self.selectedTree
          : "null"
      });
    } else {
      logger.warn("PRIME job " + self.id + ": self.params.analysis.msa structure is missing.");
    }

    // Ensure output directory exists BEFORE writing files.
    logger.info(
      "PRIME job " + self.id + ": Ensuring output directory exists at " + self.output_dir
    );
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file.
    logger.info("PRIME job " + self.id + ": Writing tree file to " + self.tree_fn, {
      tree_content: self.selectedTree
        ? self.selectedTree.length > 100
          ? self.selectedTree.substring(0, 100) + "..."
          : self.selectedTree
        : "null"
    });
    fs.writeFile(self.tree_fn, self.selectedTree, function (err) {
      if (err) {
        logger.error("PRIME job " + self.id + ": Error writing tree file: " + err.message);
        throw err;
      }
      logger.info("PRIME job " + self.id + ": Tree file written successfully");
    });

    // Ensure the progress file exists.
    logger.info("PRIME job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn prefix
  // (PRIME omits treemode) — exactly matching the original prime.js order
  // (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.prime_procs || 4; }],
    ["branches", function (self) { return self.branches; }],
    ["property_set", function (self) { return self.property_set; }],
    ["pvalue", function (self) { return self.pvalue; }],
    ["impute_states", function (self) { return self.impute_states; }]
  ]
};

var prime = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.prime is the constructor.
exports.prime = prime;
exports.descriptor = descriptor;
