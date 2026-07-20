/**
 * aBSREL analysis descriptor (Phase 2, #410).
 *
 * Declares the analysis-specific pieces the shared lib/analysis-factory.js
 * needs to reproduce the original app/absrel/absrel.js job-submission params
 * exactly (pinned by test/golden/qsub-params.snapshot.json).
 */

var factory = require("../../lib/analysis-factory.js");
var fs = require("fs");
var utilities = require("../../lib/utilities");
var logger = require("../../lib/logger").logger;

var descriptor = {
  type: "absrel",
  dir: __dirname,
  script: "absrel.sh",
  suffixes: { short: "absrel", results: "ABSREL", progress: "absrel" },
  procsKey: "absrel_procs",
  walltimeKey: "absrel_walltime",

  // Set analysis-specific self.<field> values. In checkOnly mode `src` is the
  // raw params; in normal mode it is params.analysis (or params). This mirrors
  // the original absrel.js branches.
  fields: function (self, params, src, ctx) {
    var isCheckOnly = params.checkOnly || false;
    if (isCheckOnly) {
      self.genetic_code = params.genetic_code || "Universal";
      self.multiple_hits = params.multiple_hits || "None";
      self.srv = params.srv || "Yes";
      self.blb = params.blb || 1.0;
      self.branches = params.branches || "All";
      self.nwk = "";
    } else {
      if (self.params.msa) {
        self.genetic_code = self.params.msa[0]
          ? ctx.code[self.params.msa[0].gencodeid + 1]
          : "Universal";
      } else {
        self.genetic_code = self.params.genetic_code || "Universal";
      }
      if (self.params.analysis) {
        self.nwk = self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
        self.multiple_hits = src.multiple_hits || "None";
        self.srv = src.srv || "Yes";
        self.blb = src.blb || 1.0;
        self.branches = src.branches || "All";
      } else {
        self.nwk = self.params.nwk_tree || self.params.tree || "";
        self.multiple_hits = self.params.multiple_hits || "None";
        self.srv = self.params.srv || "Yes";
        self.blb = self.params.blb || 1.0;
        self.branches = self.params.branches || "All";
      }
    }
  },

  // The {FG} tagged-tree special case (from the original absrel.js normal
  // branch): if the tree carries {FG} annotations and branches is still the
  // default "All", switch to Foreground.
  afterFields: function (self) {
    if (self.nwk && self.nwk.indexOf("{FG}") !== -1 && self.branches === "All") {
      logger.info("ABSREL job: Tagged tree contains {FG} annotations, setting branches to Foreground");
      self.branches = "FG";
    }
  },

  // Non-checkOnly side effects, reproducing the original absrel.js constructor
  // block (output-dir creation BEFORE the tree-file write, tree-file write,
  // progress-file creation) that ran before self.init().
  beforeInit: function (self) {
    // Ensure output directory exists BEFORE writing files.
    logger.info("ABSREL job " + self.id + ": Ensuring output directory exists at " + self.output_dir);
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file.
    logger.info("ABSREL job " + self.id + ": Writing tree file to " + self.tree_fn, {
      tree_content: self.nwk
        ? self.nwk.length > 100
          ? self.nwk.substring(0, 100) + "..."
          : self.nwk
        : "null"
    });
    fs.writeFile(self.tree_fn, self.nwk, function (err) {
      if (err) {
        logger.error("ABSREL job " + self.id + ": Error writing tree file: " + err.message);
        self.socket.emit("script error", {
          error: "Failed to write tree file: " + err.message
        });
        return;
      }
      logger.info("ABSREL job " + self.id + ": Tree file written successfully");
    });

    // Ensure the progress file exists.
    logger.info("ABSREL job " + self.id + ": Creating progress file at " + self.progress_fn);
    fs.openSync(self.progress_fn, "w");
  },

  // The ordered export keys AFTER the common fn/tree_fn/sfn/pfn/rfn/treemode
  // prefix — exactly matching the original absrel.js order (golden-pinned).
  exportKeys: [
    ["genetic_code", function (self) { return self.genetic_code; }],
    ["multiple_hits", function (self) { return self.multiple_hits; }],
    ["srv", function (self) { return self.srv; }],
    ["blb", function (self) { return self.blb; }],
    ["branches", function (self) { return self.branches; }],
    ["analysis_type", function (self) { return self.type; }],
    ["cwd", function (self) { return __dirname; }],
    ["msaid", function (self) { return self.msaid; }],
    ["procs", function (self, config) { return config.absrel_procs; }]
  ]
};

var absrel = factory.makeAnalysis(descriptor);

// Preserve the original module's export shape: exports.absrel is the constructor.
exports.absrel = absrel;
exports.descriptor = descriptor;
