/**
 * Golden snapshot of every declarative analysis's qsub_params (Phase 2 oracle).
 *
 * Phase 2 collapses the 14 near-identical HyPhy analysis modules into a shared
 * factory + per-analysis descriptors. This test pins the EXACT job-submission
 * parameters each analysis produces TODAY (for both slurm and local submit
 * types), so the factory migration can be proven byte-identical: if a migrated
 * analysis builds a different qsub_params array (missing key, wrong default,
 * reordered), this test fails.
 *
 * How it works:
 *   - Each analysis builds self.qsub_params in its constructor (from
 *     config.submit_type), BEFORE init(). We construct with checkOnly:true so
 *     init() routes to validateParameters() and never submits a SLURM job.
 *   - config.submit_type is a shared cached object (require('../../lib/config')),
 *     so we flip it to 'slurm' then 'local' and capture both.
 *   - Volatile bits (the "check-<timestamp>" id and absolute repo paths) are
 *     normalized to stable placeholders so the snapshot is deterministic.
 *
 * The snapshot lives in test/golden/qsub-params.snapshot.json. Regenerate it
 * intentionally with GOLDEN_UPDATE=1 (only when a param change is deliberate).
 */

var fs = require("fs"),
  path = require("path"),
  should = require("should"),
  EventEmitter = require("events").EventEmitter,
  config = require(__dirname + "/../../lib/config");

var ABS_ROOT = path.resolve(__dirname, "../..");
var HOME = require("os").homedir();
var SNAPSHOT = path.join(__dirname, "qsub-params.snapshot.json");

// The 14 declarative-candidate analyses: [label, module path, export key].
var ANALYSES = [
  ["fel", "../../app/fel/fel.js", "fel"],
  ["meme", "../../app/meme/meme.js", "meme"],
  ["slac", "../../app/slac/slac.js", "slac"],
  ["busted", "../../app/busted/busted.js", "busted"],
  ["absrel", "../../app/absrel/absrel.js", "absrel"],
  ["relax", "../../app/relax/relax.js", "relax"],
  ["prime", "../../app/prime/prime.js", "prime"],
  ["fubar", "../../app/fubar/fubar.js", "fubar"],
  ["fade", "../../app/fade/fade.js", "fade"],
  ["bgm", "../../app/bgm/bgm.js", "bgm"],
  ["multihit", "../../app/multihit/multihit.js", "multihit"],
  ["nrm", "../../app/nrm/nrm.js", "nrm"],
  ["bstill", "../../app/bstill/bstill.js", "bstill"],
  ["cfel", "../../app/contrast-fel/cfel.js", "cfel"]
];

function fakeSocket() {
  var s = new EventEmitter();
  s.id = "golden";
  s.disconnect = function () {};
  s.emit = EventEmitter.prototype.emit.bind(s);
  return s;
}

function mkParams() {
  return {
    checkOnly: true,
    _id: "GOLDEN-ID",
    analysis: { _id: "GOLDEN-ID" },
    msa: [{ _id: "MSA-ID", nj: "(A,B);", gencodeid: 0 }],
    genetic_code: "Universal"
  };
}

// Replace per-run volatile substrings with stable placeholders so the snapshot
// is deterministic: the "check-<timestamp>" id and absolute repo paths.
function normalize(arr) {
  return (arr || []).map(function (entry) {
    return String(entry)
      .split(ABS_ROOT).join("<ROOT>")
      .split(HOME).join("<HOME>")
      .replace(/check-\d+/g, "check-<TS>");
  });
}

function capture(modPath, exportKey, submitType) {
  config.submit_type = submitType;
  var mod = require(modPath);
  var Ctor = mod[exportKey];
  var job = new Ctor(fakeSocket(), ">A\nACGT\n", mkParams());
  return {
    type: job.type,
    resultsSuffix: job.results_fn ? path.basename(job.results_fn).replace(/^check-<?TS>?\.?/, "").replace(/check-\d+\.?/, "") : null,
    qsub_params: normalize(job.qsub_params)
  };
}

// ---------------------------------------------------------------------------
// Bespoke analyses (gard, difFubar, hivtrace).
//
// These are NOT part of the 14-analysis factory family and each is captured
// specially:
//   - gard      : supports checkOnly, so it routes through hyphyJob.init() ->
//                 validateParameters() and never submits (like the factory
//                 analyses). It exposes self.qsub_params.
//   - difFubar  : has NO checkOnly branch of its own, but its constructor ends
//                 in self.init() (inherited from hyphyJob), which DOES honour
//                 params.checkOnly and routes to validateParameters() instead
//                 of spawn(). So passing checkOnly:true captures qsub_params
//                 without submitting a SLURM job. It exposes self.qsub_params.
//   - hivtrace  : does NOT honour checkOnly at all — its constructor
//                 unconditionally calls self.spawn(), which submits via sbatch.
//                 We therefore STUB hivtrace.prototype.spawn to a no-op so the
//                 constructor builds params but nothing is submitted. hivtrace
//                 builds BOTH self.qsub_params (torque) AND self.slurm_params
//                 (SLURM); for slurm mode we snapshot self.slurm_params (the
//                 field its sbatch path actually submits).
// ---------------------------------------------------------------------------

var GARD_PATH = "../../app/gard/gard.js";
var DIFFUBAR_PATH = "../../app/difFubar/difFubar.js";
var HIVTRACE_PATH = "../../app/hivtrace/hivtrace.js";

function captureGard(submitType) {
  config.submit_type = submitType;
  var Ctor = require(GARD_PATH).gard;
  // checkOnly:true -> init() -> validateParameters(), never submits.
  // We pass ONLY genetic_code + tree so GARD's own defaults (rate_classes,
  // run_mode, datatype, max_breakpoints, model, site_to_site_variation) are
  // exercised — that is what makes the mutation-check meaningful: flipping any
  // GARD param default drifts this snapshot.
  var job = new Ctor(fakeSocket(), ">A\nACGT\n", {
    checkOnly: true,
    genetic_code: "Universal",
    nwk_tree: "(A,B);"
  });
  return {
    type: job.type,
    resultsSuffix: job.results_fn
      ? path.basename(job.results_fn).replace(/^check-\d+\.?/, "")
      : null,
    field: "qsub_params",
    qsub_params: normalize(job.qsub_params)
  };
}

function captureDifFubar(submitType) {
  config.submit_type = submitType;
  var Ctor = require(DIFFUBAR_PATH).difFubar;
  // difFubar has no checkOnly of its own, but the inherited init() honours it:
  // checkOnly:true routes to validateParameters() and NEVER submits. A stable
  // _id avoids any volatile timestamp in the snapshot.
  var job = new Ctor(fakeSocket(), ">A\nACGT\n", {
    checkOnly: true,
    analysis: {
      _id: "GOLDEN-ID",
      number_of_grid_points: 20,
      concentration_of_dirichlet_prior: 0.5,
      mcmc_iterations: 2500,
      burnin_samples: 500,
      pos_threshold: 0.95
    },
    msa: [{ _id: "MSA-ID", nj: "(A,B);" }]
  });
  return {
    type: job.type,
    resultsSuffix: job.results_fn ? path.basename(job.results_fn) : null,
    field: "qsub_params",
    qsub_params: normalize(job.qsub_params)
  };
}

function captureHivtrace(submitType) {
  config.submit_type = submitType;
  var mod = require(HIVTRACE_PATH);
  var Ctor = mod.hivtrace;
  // hivtrace does NOT honour checkOnly; its constructor unconditionally calls
  // self.spawn() which submits via sbatch. STUB spawn so nothing is submitted
  // while the constructor still builds qsub_params + slurm_params.
  var origSpawn = Ctor.prototype.spawn;
  Ctor.prototype.spawn = function () {};
  var job;
  try {
    job = new Ctor(fakeSocket(), new EventEmitter(), {
      _id: "GOLDEN-ID",
      distance_threshold: 0.015,
      ambiguity_handling: "Resolve",
      fraction: 0.05,
      reference: "HXB2_prrt",
      filter_edges: "no",
      reference_strip: "no",
      min_overlap: 500,
      status_stack: [],
      lanl_compare: "no",
      prealigned: "no",
      strip_drams: "no"
    });
  } finally {
    Ctor.prototype.spawn = origSpawn;
  }
  // hivtrace builds self.slurm_params for its sbatch path and self.qsub_params
  // for torque. For slurm mode we snapshot the field it actually submits.
  var field = submitType === "slurm" ? "slurm_params" : "qsub_params";
  return {
    type: job.type,
    resultsSuffix: null,
    field: field,
    qsub_params: normalize(job[field])
  };
}

describe("golden: analysis qsub_params snapshot (Phase 2 oracle)", function () {
  this.timeout(20000);

  // Bespoke analyses, keyed by label -> capture function. difFubar's
  // constructor synchronously opens its progress file, so its output dir must
  // exist before construction; ensure the output dirs for all three.
  var utilities = require("../../lib/utilities");
  var BESPOKE = {
    gard: captureGard,
    difFubar: captureDifFubar,
    hivtrace: captureHivtrace
  };
  var BESPOKE_LABELS = Object.keys(BESPOKE);
  var ALL_LABELS = ANALYSES.map(function (a) { return a[0]; }).concat(BESPOKE_LABELS);

  var current = {};
  before(function () {
    utilities.ensureDirectoryExists(path.join(ABS_ROOT, "app/gard/output"));
    utilities.ensureDirectoryExists(path.join(ABS_ROOT, "app/difFubar/output"));
    utilities.ensureDirectoryExists(path.join(ABS_ROOT, "app/hivtrace/output"));

    ANALYSES.forEach(function (a) {
      var label = a[0], modPath = a[1], key = a[2];
      current[label] = {
        slurm: capture(modPath, key, "slurm"),
        local: capture(modPath, key, "local")
      };
    });
    BESPOKE_LABELS.forEach(function (label) {
      var fn = BESPOKE[label];
      current[label] = {
        slurm: fn("slurm"),
        local: fn("local")
      };
    });
    // restore a sane default so later suites aren't affected
    config.submit_type = "slurm";
  });

  it("captures all 14 factory + 3 bespoke analyses for slurm and local", function () {
    Object.keys(current).length.should.equal(17);
    ALL_LABELS.forEach(function (label) {
      current[label].slurm.qsub_params.length.should.be.above(0);
      current[label].local.qsub_params.length.should.be.above(0);
    });
  });

  if (process.env.GOLDEN_UPDATE === "1" || !fs.existsSync(SNAPSHOT)) {
    it("writes the golden snapshot", function () {
      fs.writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2) + "\n");
      // Sanity: file is valid + non-trivial.
      var written = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
      Object.keys(written).length.should.equal(17);
    });
  } else {
    it("matches the committed golden snapshot (byte-for-byte per analysis)", function () {
      var golden = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
      ALL_LABELS.forEach(function (label) {
        should.exist(golden[label], "missing golden entry for " + label);
        current[label].slurm.qsub_params.should.eql(
          golden[label].slurm.qsub_params, label + " slurm qsub_params drift");
        current[label].local.qsub_params.should.eql(
          golden[label].local.qsub_params, label + " local qsub_params drift");
        current[label].slurm.type.should.equal(golden[label].slurm.type, label + " type drift");
      });
    });
  }
});
