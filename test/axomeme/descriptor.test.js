/**
 * descriptor.test.js — unit tests for app/axomeme/descriptor.js.
 *
 * Two concerns, both testable without a scheduler or a model load:
 *
 *   1. INJECTION HARDENING. reference_sequence is interpolated into the
 *      comma-joined SLURM --export string, so SAFE_SEQUENCE_NAME is a security
 *      control: a value like "a,b=c" must be BLANKED by fields() (whitelist,
 *      not sanitize), leaving "reference_sequence=" in the export string and
 *      injecting NO extra key=value pairs. Same for the call_mode/max_species
 *      clamps — every value that reaches the export string is validated first.
 *
 *   2. checkOnly VALIDATION. AxoMEME overrides hyphyJob.validateParameters
 *      (the base hard-requires genetic_code, which AxoMEME does not have) and
 *      must emit EXACTLY the base's payload shape {valid, errors}, refusing a
 *      topology-only tree (the model reads branch lengths as distances).
 *
 * Analyses are constructed in checkOnly mode with a stub socket, exactly like
 * test/golden/qsub-params.js: init() routes to validateParameters() and never
 * submits a job.
 */

const should = require("should"),
  EventEmitter = require("events").EventEmitter,
  config = require(__dirname + "/../../lib/config"),
  axomeme = require(__dirname + "/../../app/axomeme/descriptor.js");

// Stub socket: EventEmitter + noop disconnect (mirrors qsub-params.js).
function fakeSocket() {
  const s = new EventEmitter();
  s.id = "descriptor-test";
  s.disconnect = function () {};
  s.emit = EventEmitter.prototype.emit.bind(s);
  return s;
}

// Construct an axomeme analysis in checkOnly mode and capture both the job
// object and the synchronously-emitted "validated" payload (init() calls
// validateParameters() synchronously inside the constructor, so the listener
// attached before construction sees the emit).
function runCheck(extraParams) {
  const socket = fakeSocket();
  let validated = null;
  socket.on("validated", function (payload) {
    validated = payload;
  });
  const params = Object.assign(
    {
      checkOnly: true,
      _id: "DESCRIPTOR-TEST-ID",
      analysis: { _id: "DESCRIPTOR-TEST-ID" }
    },
    extraParams || {}
  );
  const job = new axomeme.axomeme(socket, ">A\nACGT\n", params);
  return { job: job, validated: validated };
}

// A tiny tree WITH branch lengths, and the same topology stripped of them.
const TREE_WITH_LENGTHS = "(A:0.1,B:0.2);";
const TREE_TOPOLOGY_ONLY = "(A,B);";

describe("axomeme descriptor", function () {
  this.timeout(20000);

  // The --export string only exists in slurm mode; config is the shared cached
  // object (see test/golden/qsub-params.js), so flip it for this suite and
  // restore whatever this host had afterwards.
  let originalSubmitType;
  before(function () {
    originalSubmitType = config.submit_type;
    config.submit_type = "slurm";
  });
  after(function () {
    config.submit_type = originalSubmitType;
  });

  describe("reference_sequence injection hardening", function () {
    it("blanks 'a,b=c' and exports reference_sequence=, with no injected keys", function () {
      const out = runCheck({
        msa: [{ nj: TREE_WITH_LENGTHS }],
        reference_sequence: "a,b=c"
      });

      // fields() whitelists, it does not sanitize: the whole value is dropped
      // to "" (auto-pick), never rewritten.
      out.job.reference_sequence.should.equal("");

      const exportParam = out.job.qsub_params.find(function (p) {
        return String(p).indexOf("--export=") === 0;
      });
      should.exist(exportParam, "no --export param in slurm qsub_params");

      // The blanked value leaves an empty pair followed by the next key —
      // "reference_sequence=," — and, critically, the comma-joined export
      // string contains NO key smuggled in through the value.
      exportParam.indexOf("reference_sequence=,").should.be.above(-1);
      exportParam.indexOf("b=c").should.equal(-1);
    });

    it("passes a whitelisted name through unchanged", function () {
      const out = runCheck({
        msa: [{ nj: TREE_WITH_LENGTHS }],
        reference_sequence: "HIV1_B.JRCSF|x:1-30"
      });
      out.job.reference_sequence.should.equal("HIV1_B.JRCSF|x:1-30");
      const exportParam = out.job.qsub_params.find(function (p) {
        return String(p).indexOf("--export=") === 0;
      });
      exportParam.indexOf("reference_sequence=HIV1_B.JRCSF|x:1-30,").should.be.above(-1);
    });
  });

  describe("option clamps", function () {
    it("falls back to percentile on a garbage call_mode", function () {
      const out = runCheck({
        msa: [{ nj: TREE_WITH_LENGTHS }],
        call_mode: "'; DROP TABLE jobs; --"
      });
      out.job.call_mode.should.equal("percentile");
    });

    it("clamps max_species 9999 to 512", function () {
      const out = runCheck({
        msa: [{ nj: TREE_WITH_LENGTHS }],
        max_species: 9999
      });
      out.job.max_species.should.equal(512);
    });

    it("falls back to 512 on a non-numeric max_species", function () {
      const out = runCheck({
        msa: [{ nj: TREE_WITH_LENGTHS }],
        max_species: "abc"
      });
      out.job.max_species.should.equal(512);
    });
  });

  describe("validateParameters (checkOnly)", function () {
    it("emits {valid:true, errors:[]} for a tree with branch lengths", function () {
      const out = runCheck({ msa: [{ nj: TREE_WITH_LENGTHS }] });
      should.exist(out.validated, "no validated event was emitted");
      out.validated.valid.should.equal(true);
      out.validated.errors.should.eql([]);
      // Payload shape is pinned: EXACTLY {valid, errors}, like the base
      // hyphyJob.validateParameters (test/validation/results.js relies on it).
      Object.keys(out.validated).sort().should.eql(["errors", "valid"]);
    });

    it("emits valid:false with a branch-lengths error for a topology-only tree", function () {
      const out = runCheck({ msa: [{ nj: TREE_TOPOLOGY_ONLY }] });
      should.exist(out.validated, "no validated event was emitted");
      out.validated.valid.should.equal(false);
      out.validated.errors.length.should.be.above(0);
      out.validated.errors
        .some(function (e) {
          return /branch lengths/.test(e);
        })
        .should.equal(true, "expected a branch-lengths error, got: " + JSON.stringify(out.validated.errors));
      Object.keys(out.validated).sort().should.eql(["errors", "valid"]);
    });
  });
});
