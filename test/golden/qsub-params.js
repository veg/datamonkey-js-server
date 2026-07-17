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
 *   - config.submit_type is a shared cached object (require('../../config.json')),
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
  config = require(__dirname + "/../../config.json");

var ABS_ROOT = path.resolve(__dirname, "../..");
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

describe("golden: analysis qsub_params snapshot (Phase 2 oracle)", function () {
  this.timeout(20000);

  var current = {};
  before(function () {
    ANALYSES.forEach(function (a) {
      var label = a[0], modPath = a[1], key = a[2];
      current[label] = {
        slurm: capture(modPath, key, "slurm"),
        local: capture(modPath, key, "local")
      };
    });
    // restore a sane default so later suites aren't affected
    config.submit_type = "slurm";
  });

  it("captures all 14 analyses for slurm and local", function () {
    Object.keys(current).length.should.equal(14);
    ANALYSES.forEach(function (a) {
      current[a[0]].slurm.qsub_params.length.should.be.above(0);
      current[a[0]].local.qsub_params.length.should.be.above(0);
    });
  });

  if (process.env.GOLDEN_UPDATE === "1" || !fs.existsSync(SNAPSHOT)) {
    it("writes the golden snapshot", function () {
      fs.writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2) + "\n");
      // Sanity: file is valid + non-trivial.
      var written = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
      Object.keys(written).length.should.equal(14);
    });
  } else {
    it("matches the committed golden snapshot (byte-for-byte per analysis)", function () {
      var golden = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
      ANALYSES.forEach(function (a) {
        var label = a[0];
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
