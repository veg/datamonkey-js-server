/**
 * analysis-factory.js — shared builder for the declarative HyPhy analyses.
 *
 * Phase 2 (#410) collapses the 14 near-identical analysis modules
 * (fel, meme, slac, busted, absrel, relax, prime, fubar, fade, bgm, multihit,
 * nrm, bstill, cfel) into one factory + per-analysis descriptors. Each of those
 * modules today repeats the same shape:
 *
 *   1. read params (with defaults) into self.<field>, in a checkOnly branch and
 *      a normal branch;
 *   2. derive file paths (fn/output_dir/status_fn/results_short_fn/results_fn/
 *      progress_fn/tree_fn) — identical except for a few suffixes;
 *   3. build self.qsub_params for config.submit_type (local | slurm | qsub);
 *   4. call self.init().
 *
 * This factory generates steps 2-4 from a descriptor; the descriptor supplies
 * the analysis-specific bits of steps 1-3.
 *
 * IMPORTANT — byte-identical requirement: the generated qsub_params must match
 * the pre-migration output exactly (test/golden/qsub-params.js pins this).
 * The SLURM `--export=ALL,...` key ORDER is analysis-specific (analysis_type and
 * genetic_code land in different positions per analysis), so the descriptor
 * declares the FULL ordered export-key list rather than the factory assuming
 * one. See a descriptor (e.g. app/fel/descriptor.js) for the shape.
 *
 * DESCRIPTOR SHAPE
 * ----------------
 * {
 *   type: "fel",                       // self.type / analysis_type
 *   dir: __dirname,                    // the analysis app dir (for cwd + script + output)
 *   script: "fel.sh",                  // qsub_script_name
 *   suffixes: {                        // file suffixes (results_short/results/progress)
 *     short: "fel",                    // rfn -> <fn>.fel
 *     results: "FEL",                  // results_fn -> <fn>.FEL.json
 *     progress: "fel"                  // progress_fn -> <fn>.fel.progress
 *   },
 *   procsKey: "fel_procs",             // config.<procsKey> (fallback 4)
 *   walltimeKey: "fel_walltime",       // config.<walltimeKey>
 *   // Resolve analysis-specific self.<field> values. Called with (self, params,
 *   // analysisParams, ctx) where ctx = { code, model }. Runs in BOTH checkOnly
 *   // and normal mode; use params vs analysisParams as the module did.
 *   fields: function (self, params, analysisParams, ctx) { ... set self.X ... },
 *   // Ordered list of the analysis-specific export keys (between the common
 *   // rfn/treemode prefix and the common cwd/msaid/procs — but note some
 *   // analyses interleave analysis_type/genetic_code, so this list is the FULL
 *   // ordered set AFTER treemode and BEFORE the --output flag). Each entry is
 *   // [key, fn(self, config)] producing the value string.
 *   exportKeys: [ ["bootstrap", function(self){ return self.bootstrap; }], ... ],
 *   // Optional post-field hook (e.g. the {FG} tagged-tree branch override).
 *   afterFields: function (self) { ... },
 *   // Optional non-checkOnly side effects run just before self.init() (sanitize
 *   // tree, write tree_fn, ensure output dir, create progress file) — the work
 *   // the original module did inside `if (!isCheckOnly) { ... }`.
 *   beforeInit: function (self, ctx) { ... }
 * }
 */

var path = require("path");
var util = require("util");
var config = require("../config.json");
var logger = require("./logger").logger;
var hyphyJob = require("../app/hyphyjob.js").hyphyJob;
var code = require("../app/code").code;
var model = require("../app/model").model;

// Convert a PBS walltime (D:HH:MM:SS or HH:MM:SS) to SLURM format, matching the
// per-analysis inline logic exactly.
function toSlurmTime(walltime) {
  var slurmTime = "72:00:00";
  if (walltime) {
    var parts = walltime.split(":");
    if (parts.length === 4) {
      var days = parseInt(parts[0]);
      var hours = parseInt(parts[1]) + days * 24;
      slurmTime = hours + ":" + parts[2] + ":" + parts[3];
    } else if (parts.length === 3) {
      slurmTime = walltime;
    }
  }
  return slurmTime;
}

/**
 * Build an analysis constructor from a descriptor. Returns a function usable as
 * `new AnalysisCtor(socket, stream, params)` that behaves like the original
 * hand-written module.
 */
function makeAnalysis(descriptor) {
  var ctx = { code: code, model: model };

  function Analysis(socket, stream, params) {
    var self = this;
    self.socket = socket;
    self.stream = stream;
    self.params = params;

    var isCheckOnly = params.checkOnly || false;
    self.type = descriptor.type;

    // --- resolve analysis-specific fields (checkOnly reads params; normal reads
    // analysisParams). The descriptor decides which; we pass both. ---
    var analysisParams = isCheckOnly ? params : (self.params.analysis || self.params);
    descriptor.fields(self, params, analysisParams, ctx);

    // --- id / msaid / genetic_code / tree (the common fallback dance) ---
    if (isCheckOnly) {
      self.id = "check-" + Date.now();
      self.msaid = "check";
    } else {
      if (self.params.msa) {
        self.msaid = self.params.msa._id;
      } else {
        self.msaid = self.params.msaid || "unknown";
      }
      if (self.params.analysis) {
        self.id =
          self.params.analysis._id ||
          (self.params.job && self.params.job.id) ||
          self.params.id ||
          "unknown-" + Date.now();
      } else {
        self.id =
          (self.params.job && self.params.job.id) || self.params.id || "unknown-" + Date.now();
      }
    }

    if (descriptor.afterFields) descriptor.afterFields(self);

    // --- file-path derivation (identical across analyses except suffixes) ---
    self.fn = descriptor.dir + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + "." + descriptor.suffixes.short;
    self.results_fn = self.fn + "." + descriptor.suffixes.results + ".json";
    self.progress_fn = self.fn + "." + descriptor.suffixes.progress + ".progress";
    self.tree_fn = self.fn + ".tre";

    self.treemode = self.params.treemode || "0";

    self.qsub_script_name = descriptor.script;
    self.qsub_script = descriptor.dir + "/" + self.qsub_script_name;

    self.qsub_params = buildQsubParams(self, descriptor);

    // Non-checkOnly side effects — sanitize the tree, write the tree file,
    // ensure the output dir exists, and create the progress file — exactly as
    // the original hand-written module did before self.init(). Declared per
    // analysis via the descriptor's optional beforeInit hook (checkOnly skips
    // it, matching the original `if (!isCheckOnly)` guard).
    if (!isCheckOnly && descriptor.beforeInit) {
      descriptor.beforeInit(self, ctx);
    }

    self.init();
  }

  util.inherits(Analysis, hyphyJob);
  return Analysis;
}

// The common file-path key=value pairs that lead every analysis's param block.
// Most analyses use the full set, but a few omit one (relax has no rfn; prime
// has no treemode), so descriptor.prefixKeys can override the default order.
var DEFAULT_PREFIX = ["fn", "tree_fn", "sfn", "pfn", "rfn", "treemode"];
var PREFIX_VALUES = {
  fn: function (self) { return self.fn; },
  tree_fn: function (self) { return self.tree_fn; },
  sfn: function (self) { return self.status_fn; },
  pfn: function (self) { return self.progress_fn; },
  rfn: function (self) { return self.results_short_fn; },
  treemode: function (self) { return self.treemode; }
};

function commonPrefixPairs(self, descriptor) {
  var order = descriptor.prefixKeys || DEFAULT_PREFIX;
  return order.map(function (k) {
    return k + "=" + PREFIX_VALUES[k](self);
  });
}

// Assemble the export="ALL,..." key=value string from the descriptor's ordered
// list, preceded by the common prefix and using each entry's value fn.
function buildExport(self, descriptor) {
  var procs = config[descriptor.procsKey];
  var pairs = ["slurm_mpi_type=" + (config.slurm_mpi_type || "pmix")].concat(
    commonPrefixPairs(self, descriptor)
  );
  descriptor.exportKeys.forEach(function (entry) {
    var key = entry[0];
    var valFn = entry[1];
    var opts = entry[2] || {};
    // A few analyses' SLURM export differs from local (e.g. busted omits
    // analysis_type in slurm but includes it in local). Honor skipInSlurm.
    if (opts.skipInSlurm) return;
    pairs.push(key + "=" + valFn(self, config, procs));
  });
  return "ALL," + pairs.join(",");
}

function buildQsubParams(self, descriptor) {
  var procs = config[descriptor.procsKey] || 4;
  if (config.submit_type === "slurm") {
    var slurmTime = toSlurmTime(config[descriptor.walltimeKey]);
    logger.info(
      "Converted walltime from " + config[descriptor.walltimeKey] + " to SLURM format: " + slurmTime
    );
    return [
      "--ntasks=" + procs,
      "--cpus-per-task=1",
      "--time=" + slurmTime,
      "--partition=" + (config.slurm_partition || "datamonkey"),
      "--nodes=1",
      "--export=" + buildExport(self, descriptor),
      "--output=" + self.output_dir + "/" + descriptor.type + "_" + self.id + "_%j.out",
      "--error=" + self.output_dir + "/" + descriptor.type + "_" + self.id + "_%j.err",
      self.qsub_script
    ];
  }
  // local (and any non-slurm) path: script first, then bare key=val pairs.
  var params = [self.qsub_script];
  var procsLocal = config[descriptor.procsKey];
  var pairs = commonPrefixPairs(self, descriptor);
  descriptor.exportKeys.forEach(function (entry) {
    pairs.push(entry[0] + "=" + entry[1](self, config, procsLocal));
  });
  return params.concat(pairs);
}

module.exports = { makeAnalysis: makeAnalysis, toSlurmTime: toSlurmTime };
