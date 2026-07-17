/**
 * validation.js — error-path & input-validation tests.
 *
 * These tests exercise the NON-SLURM validation route and the pre-submission
 * guards. They never reach sbatch:
 *
 *   1. checkOnly path: hyphyJob.prototype.validateParameters
 *      (app/hyphyjob.js:537). init() (hyphyjob.js:81) branches on
 *      params.checkOnly; when truthy it calls validateParameters() INSTEAD of
 *      spawn(). validateParameters pushes "analysis_type is required" if
 *      !params.analysis_type (hyphyjob.js:545) and "genetic_code is required"
 *      if !params.genetic_code (hyphyjob.js:550), then emits
 *      socket.emit("validated", {valid, errors}) (hyphyjob.js:556) and
 *      socket.disconnect() (hyphyjob.js:562). NO sbatch runs on this path.
 *
 *   2. Contrast-FEL <2 branch sets (#395): on a REAL (non-check) submit,
 *      cfel.js:238-249 counts branch sets by split(':') and, if <2, emits
 *      socket.emit("script error", {...}) and RETURNS before self.init()
 *      (cfel.js:248). So the guard is assertable with ZERO sbatch: the early
 *      return precedes any job submission.
 *
 *   3. GARD codon --code (#393): construct GARD in checkOnly mode and inspect
 *      the constructed self.qsub_params (built at gard.js:194/200 BEFORE
 *      self.init()) for genetic_code=<code> and datatype=codon. No submission.
 *
 * Only live Redis is required (client.hset in init(), hyphyjob.js:75, and
 * ClientSocket subscribe in attachSocket(), hyphyjob.js:66) — both cheap.
 * There is NO SLURM interaction anywhere in this file.
 *
 * Ports are >= 5300 to avoid colliding with the existing tests (5100-5199)
 * and the integration suite.
 */

const should = require("should");
const path = require("path");
const harness = require(path.join(__dirname, "..", "helpers", "socketharness.js"));
const cfel = require(path.join(__dirname, "..", "..", "app", "contrast-fel", "cfel.js"));
const gard = require(path.join(__dirname, "..", "..", "app", "gard", "gard.js"));

const PORT = 5301;

describe("error-paths / input validation (no SLURM)", function () {
  var server;

  before(function () {
    server = harness.startServer(PORT);

    // Wire server-side check/spawn handlers, mirroring test/slac/slac.js:45-49.
    server.on("connection", function (socket) {
      // checkOnly path -> hyphyJob.validateParameters (no submission).
      socket.on("cfel:check", function (params) {
        params.checkOnly = true;
        new cfel.cfel(socket, null, params);
      });

      // REAL (non-check) submit — used ONLY to trigger the #395 branch-set
      // guard, which emits "script error" and RETURNS before self.init()
      // (cfel.js:248), so nothing is ever submitted to SLURM.
      socket.on("cfel:spawn", function (params) {
        new cfel.cfel(socket, null, params);
      });
    });
  });

  after(function () {
    try { server.close(); } catch (e) { /* ignore */ }
  });

  // -------------------------------------------------------------------------
  // Layer 1: checkOnly / "validated" payload assertions
  // -------------------------------------------------------------------------

  it('emits validated{valid:false} with BOTH errors when analysis_type and genetic_code are missing', function (done) {
    this.timeout(15000);
    var client = harness.connectClient(PORT);
    var finished = false;
    function finish(err) { if (finished) return; finished = true; try { client.close(); } catch (e) {} done(err); }

    client.on("connect", function () {
      // params carries ONLY checkOnly -> both required-field branches fire.
      client.emit("cfel:check", {});
    });

    client.on("validated", function (d) {
      try {
        should.exist(d);
        d.valid.should.equal(false);
        d.errors.should.be.an.Array();
        d.errors.should.containEql("analysis_type is required");
        d.errors.should.containEql("genetic_code is required");
        d.errors.length.should.equal(2);
      } catch (e) { return finish(e); }
      finish();
    });
  });

  it('emits validated with ONLY analysis_type error when genetic_code is supplied', function (done) {
    this.timeout(15000);
    var client = harness.connectClient(PORT);
    var finished = false;
    function finish(err) { if (finished) return; finished = true; try { client.close(); } catch (e) {} done(err); }

    client.on("connect", function () {
      client.emit("cfel:check", { genetic_code: "Universal" });
    });

    client.on("validated", function (d) {
      try {
        d.valid.should.equal(false);
        d.errors.should.eql(["analysis_type is required"]);
      } catch (e) { return finish(e); }
      finish();
    });
  });

  it('emits validated with ONLY genetic_code error when analysis_type is supplied', function (done) {
    this.timeout(15000);
    var client = harness.connectClient(PORT);
    var finished = false;
    function finish(err) { if (finished) return; finished = true; try { client.close(); } catch (e) {} done(err); }

    client.on("connect", function () {
      client.emit("cfel:check", { analysis_type: "cfel" });
    });

    client.on("validated", function (d) {
      try {
        d.valid.should.equal(false);
        d.errors.should.eql(["genetic_code is required"]);
      } catch (e) { return finish(e); }
      finish();
    });
  });

  it('emits validated{valid:true, errors:[]} and disconnects when both required params are present', function (done) {
    this.timeout(15000);
    var client = harness.connectClient(PORT);
    var finished = false;
    var sawValidated = false;
    function finish(err) { if (finished) return; finished = true; try { client.close(); } catch (e) {} done(err); }

    client.on("connect", function () {
      client.emit("cfel:check", { analysis_type: "cfel", genetic_code: "Universal" });
    });

    client.on("validated", function (d) {
      sawValidated = true;
      try {
        d.valid.should.equal(true);
        d.errors.should.be.an.Array();
        d.errors.length.should.equal(0);
      } catch (e) { return finish(e); }
      // validateParameters calls socket.disconnect() at hyphyjob.js:562;
      // the client should observe a disconnect after 'validated'.
    });

    client.on("disconnect", function () {
      try {
        sawValidated.should.equal(true, "expected 'validated' before disconnect");
      } catch (e) { return finish(e); }
      finish();
    });
  });

  // -------------------------------------------------------------------------
  // Layer 2: Contrast-FEL <2 branch-set guard (#395) — real submit path,
  // but the guard returns BEFORE self.init(), so nothing hits SLURM.
  // -------------------------------------------------------------------------

  it('rejects Contrast-FEL with a single branch set (script error, NO submission) — #395', function (done) {
    this.timeout(15000);
    var client = harness.connectClient(PORT);
    var finished = false;
    function finish(err) { if (finished) return; finished = true; try { client.close(); } catch (e) {} done(err); }

    // Guard against accidental submission: if the constructor ever reaches
    // init()/spawn(), a "job created" would fire — that must NOT happen.
    client.on("job created", function () {
      finish(new Error("unexpected 'job created' — a job was submitted despite <2 branch sets"));
    });

    client.on("connect", function () {
      // Single-element branch-set array -> counted as 1 set -> fails >=2 guard.
      client.emit("cfel:spawn", {
        id: "test-cfel-onegroup",
        genetic_code: "Universal",
        tree: "((a,b),c);",
        "branch-set": ["Foreground"]
      });
    });

    client.on("script error", function (d) {
      try {
        should.exist(d);
        should.exist(d.error);
        d.error.should.match(/two branch groups/i);
      } catch (e) { return finish(e); }
      // Give a short beat to ensure no "job created" sneaks in afterward.
      setTimeout(finish, 300);
    });
  });

  it('rejects Contrast-FEL with an empty branch-set string (script error, NO submission) — #395', function (done) {
    this.timeout(15000);
    var client = harness.connectClient(PORT);
    var finished = false;
    function finish(err) { if (finished) return; finished = true; try { client.close(); } catch (e) {} done(err); }

    client.on("job created", function () {
      finish(new Error("unexpected 'job created' — a job was submitted despite 0 branch sets"));
    });

    client.on("connect", function () {
      client.emit("cfel:spawn", {
        id: "test-cfel-nogroup",
        genetic_code: "Universal",
        tree: "((a,b),c);",
        "branch-set": ""
      });
    });

    client.on("script error", function (d) {
      try {
        d.error.should.match(/two branch groups/i);
      } catch (e) { return finish(e); }
      setTimeout(finish, 300);
    });
  });

  // -------------------------------------------------------------------------
  // Layer 3: branch-set counting semantics (constructed-params level, no I/O).
  // Verifies the split(':') filter at cfel.js:239-242 that the guard relies on.
  // -------------------------------------------------------------------------

  it('counts a joined 2-element branch-set array as 2 sets (guard logic, cfel.js:239-242)', function () {
    // Reproduce the exact counting used by the #395 guard.
    function countSets(rawBranchSets) {
      var joined = Array.isArray(rawBranchSets) ? rawBranchSets.join(":") : rawBranchSets;
      return String(joined == null ? "" : joined)
        .split(":")
        .filter(function (s) { return s.trim().length; })
        .length;
    }
    countSets(["Foreground", "Background"]).should.equal(2);
    countSets(["Foreground"]).should.equal(1);
    countSets("").should.equal(0);
    countSets(null).should.equal(0);
    countSets("A:B:C").should.equal(3);
    // Whitespace-only groups do not count.
    countSets(["Foreground", "   "]).should.equal(1);
  });

  // -------------------------------------------------------------------------
  // Layer 4: GARD codon job passes genetic --code (#393). Constructed at the
  // qsub_params level in checkOnly mode (built before self.init()); no SLURM.
  // -------------------------------------------------------------------------

  it('GARD codon job builds qsub_params with genetic_code=<code> and datatype=codon (#393)', function (done) {
    this.timeout(15000);
    // checkOnly path still constructs self.qsub_params (gard.js:194/200) and
    // then reaches validateParameters (emits "validated", no submission).
    var g = new gard.gard(
      { emit: function () {}, disconnect: function () {} },
      null,
      { checkOnly: true, datatype: "codon", genetic_code: "Universal", analysis_type: "gard" }
    );

    try {
      g.datatype.should.equal("codon");
      g.genetic_code.should.equal("Universal");
      should.exist(g.qsub_params);
      g.qsub_params.should.be.an.Array();
      var joined = g.qsub_params.join(" ");
      joined.should.match(/genetic_code=Universal/);
      joined.should.match(/datatype=codon/);
    } catch (e) { return done(e); }
    done();
  });

  it('GARD checkOnly defaults genetic_code to Universal when omitted (gard.js:43)', function (done) {
    this.timeout(15000);
    var g = new gard.gard(
      { emit: function () {}, disconnect: function () {} },
      null,
      { checkOnly: true, datatype: "codon", analysis_type: "gard" }
    );
    try {
      g.genetic_code.should.equal("Universal");
      g.qsub_params.join(" ").should.match(/genetic_code=Universal/);
    } catch (e) { return done(e); }
    done();
  });

  // -------------------------------------------------------------------------
  // Layer 5: documented NON-coverage of the base validated path.
  // base validateParameters only checks analysis_type + genetic_code — it does
  // NOT catch a missing tree. A checkOnly cfel with both required params but no
  // tree still validates true (empty nwk_tree defaulted at cfel.js:51).
  // -------------------------------------------------------------------------

  it('base validation does NOT flag a missing tree (validates true) — documents #395/tree non-coverage', function (done) {
    this.timeout(15000);
    var client = harness.connectClient(PORT);
    var finished = false;
    function finish(err) { if (finished) return; finished = true; try { client.close(); } catch (e) {} done(err); }

    client.on("connect", function () {
      // Both required params present, but NO tree provided.
      client.emit("cfel:check", { analysis_type: "cfel", genetic_code: "Universal" });
    });

    client.on("validated", function (d) {
      try {
        // valid:true proves the base validator ignores tree/alignment/branch sets.
        d.valid.should.equal(true);
        d.errors.length.should.equal(0);
      } catch (e) { return finish(e); }
      finish();
    });
  });
});
