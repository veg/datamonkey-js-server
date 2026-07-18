/**
 * Factory parity test (Phase 2, #410).
 *
 * Proves that an analysis built by lib/analysis-factory.js from a descriptor
 * produces qsub_params BYTE-IDENTICAL to the golden snapshot captured from the
 * original hand-written module. This is the gate every batch-migration PR must
 * pass: migrate an analysis to a descriptor, then this test confirms no drift.
 *
 * PR 2 wires only the fel descriptor as the proving case (fel.js itself is not
 * yet switched over — that happens in the batch PRs). As each analysis gains a
 * descriptor, add it to DESCRIPTORS below.
 */

var path = require("path"),
    should = require("should"),
    EventEmitter = require("events").EventEmitter,
    config = require(__dirname + "/../../config.json");

var ABS_ROOT = path.resolve(__dirname, "../..");
var GOLDEN = require(__dirname + "/qsub-params.snapshot.json");

// Descriptor-built constructors to check against golden. Grows as analyses migrate.
var DESCRIPTORS = [
  ["fel", require(__dirname + "/../../app/fel/descriptor.js").fel],
  ["meme", require(__dirname + "/../../app/meme/descriptor.js").meme],
  ["slac", require(__dirname + "/../../app/slac/descriptor.js").slac],
  ["fubar", require(__dirname + "/../../app/fubar/descriptor.js").fubar],
  ["busted", require(__dirname + "/../../app/busted/descriptor.js").busted],
  ["absrel", require(__dirname + "/../../app/absrel/descriptor.js").absrel],
  ["relax", require(__dirname + "/../../app/relax/descriptor.js").relax],
  ["prime", require(__dirname + "/../../app/prime/descriptor.js").prime]
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
function normalize(arr) {
  return (arr || []).map(function (e) {
    return String(e).split(ABS_ROOT).join("<ROOT>").replace(/check-\d+/g, "check-<TS>");
  });
}

describe("golden: factory parity (Phase 2 migration gate)", function () {
  this.timeout(20000);

  after(function () { config.submit_type = "slurm"; });

  DESCRIPTORS.forEach(function (d) {
    var label = d[0], Ctor = d[1];
    ["slurm", "local"].forEach(function (submitType) {
      it(label + " factory build matches golden (" + submitType + ")", function () {
        config.submit_type = submitType;
        var job = new Ctor(fakeSocket(), ">A\nACGT\n", mkParams());
        normalize(job.qsub_params).should.eql(
          GOLDEN[label][submitType].qsub_params,
          label + " " + submitType + " factory output drifted from golden"
        );
      });
    });
  });
});
