/**
 * test/validation/results.js
 * ===========================================================================
 * PARAMETER / RESULTS CORRECTNESS SUITE
 * ---------------------------------------------------------------------------
 * The existing analysis suite proves that a job can be *submitted* and
 * *cancelled* on the real SLURM cluster, but it never asserts that the
 * parameters an analysis DERIVES from the request are actually correct, nor
 * that the results-delivery path (read file -> Redis publish -> socket emit)
 * works. This file fills that gap in three layers that need NO 72h HyPhy run:
 *
 *   LAYER 1 — Input / param-correctness (fast, deterministic, no Redis, no
 *             SLURM). We construct the analysis object and read the fields it
 *             computes synchronously in the constructor body:
 *               * cfel: self.type, self.branch_sets (array-join, #395),
 *                       self.p_value/q_value defaults, self.qsub_params keys.
 *               * gard: self.datatype==='codon' + genetic_code propagation
 *                       into qsub_params (#393), self.rate_variation map.
 *               * difFubar: self.msaid === msa[0]._id  (#403) — NOT undefined.
 *             For cfel/gard we use checkOnly:true so NO files are written
 *             (cfel.js:212 / gard.js:272 gate fs ops on !isCheckOnly) yet
 *             qsub_params is still fully built (built unconditionally).
 *             For difFubar (which has no checkOnly branch and always calls
 *             init()->spawn()) we STUB jobRunner.prototype.submit so nothing
 *             reaches sbatch, and assert on the captured qsub_params array.
 *
 *   LAYER 2 — The 'validated' checkOnly payload: the only correctness signal
 *             that flows through the socket without a job. We drive it through
 *             the v4 socket harness and assert {valid, errors} shape.
 *
 *   LAYER 3 — Results DELIVERY correctness via a committed fixture: we point
 *             self.results_fn (and, for GARD, self.finalout_results_fn) at a
 *             tiny pre-computed file and call onComplete() directly. That
 *             reads the file, publishes {type:'completed',results} to the
 *             Redis channel self.id, and a subscribed ClientSocket re-emits
 *             'completed' to the browser socket. This exercises the real
 *             file->redis->socket path against LIVE Redis with NO sbatch.
 *
 * True NUMERIC correctness (JSON.parse of a real .FEL.json / .GARD.json from a
 * genuine HyPhy run) stays in the live integration submit tests and is NOT
 * duplicated here.
 * ===========================================================================
 */

var should = require("should"),
  fs = require("fs"),
  os = require("os"),
  path = require("path"),
  EventEmitter = require("events").EventEmitter,
  config = require(__dirname + "/../../lib/config");

var cfelMod = require(__dirname + "/../../app/contrast-fel/cfel.js");
var gardMod = require(__dirname + "/../../app/gard/gard.js");
var difFubarMod = require(__dirname + "/../../app/difFubar/difFubar.js");
var jobMod = require(__dirname + "/../../app/job.js");
var cs = require(__dirname + "/../../lib/clientsocket.js");

var harness = require(__dirname + "/../helpers/socketharness.js");

// A minimal socket stand-in for the pure/param-correctness layer: it must
// only respond to .emit()/.on() without touching the network. We collect
// emitted events so error-path assertions can inspect them.
function fakeSocket(id) {
  var s = new EventEmitter();
  s.id = id || "fake";
  s.emitted = [];
  var realEmit = s.emit.bind(s);
  s.emit = function (ev, payload) {
    s.emitted.push({ event: ev, payload: payload });
    return realEmit(ev, payload);
  };
  s.disconnect = function () { s.disconnected = true; };
  return s;
}

// Tiny valid FASTA (codon-length, 2 sequences) used as the "stream".
var FASTA = ">a\nATGATGATG\n>b\nATGATGATA\n";

// A 3-taxon newick tree with two tagged branch sets, mirroring what the
// frontend delivers for Contrast-FEL. Tags are the branch-set names.
var TAGGED_TREE = "((a{hi},b{sup}),c{sup});";

describe("validation: derived parameters + results delivery", function () {

  // =========================================================================
  // LAYER 1a — Contrast-FEL param correctness (checkOnly, no files, no SLURM)
  // =========================================================================
  describe("Contrast-FEL derived params (#395 branch-set join)", function () {

    function buildCfel(extra) {
      var params = Object.assign(
        {
          checkOnly: true,
          genetic_code: "Universal",
          "branch-set": ["hi", "sup"],
          tree: TAGGED_TREE
        },
        extra || {}
      );
      return new cfelMod.cfel(fakeSocket("cfel"), FASTA, params);
    }

    it("sets self.type to 'cfel'", function () {
      buildCfel().type.should.equal("cfel");
    });

    it("joins an array branch-set with ':' (#395)", function () {
      buildCfel().branch_sets.should.equal("hi:sup");
    });

    it("passes a pre-joined string branch-set through unchanged", function () {
      buildCfel({ "branch-set": "grpA:grpB" }).branch_sets.should.equal("grpA:grpB");
    });

    it("defaults p_value=0.05 and q_value=0.20 when unspecified", function () {
      var j = buildCfel();
      j.p_value.should.equal(0.05);
      j.q_value.should.equal(0.20);
    });

    it("propagates genetic_code into the qsub_params string", function () {
      var j = buildCfel();
      var joined = j.qsub_params.join(" ");
      joined.should.match(/genetic_code=Universal/);
    });

    it("builds qsub_params carrying the joined branch_sets (#395)", function () {
      var j = buildCfel();
      j.qsub_params.join(" ").should.match(/branch_sets=hi:sup/);
    });

    it("writes NO output files in checkOnly mode", function () {
      var j = buildCfel();
      // cfel.js gates all fs writes on !isCheckOnly; none of these should exist.
      fs.existsSync(j.tree_fn).should.be.false();
      fs.existsSync(j.progress_fn).should.be.false();
    });
  });

  // =========================================================================
  // LAYER 1b — GARD param correctness incl. the #393 codon --code fix
  // =========================================================================
  describe("GARD derived params (#393 codon genetic --code)", function () {

    function buildGard(extra) {
      var params = Object.assign(
        {
          checkOnly: true,
          genetic_code: "Universal",
          datatype: "codon",
          tree: TAGGED_TREE
        },
        extra || {}
      );
      return new gardMod.gard(fakeSocket("gard"), FASTA, params);
    }

    it("sets self.type to 'gard'", function () {
      buildGard().type.should.equal("gard");
    });

    it("derives datatype 'codon'", function () {
      buildGard().datatype.should.equal("codon");
    });

    it("maps site-to-site variation via variation_map (none -> None)", function () {
      buildGard({ site_to_site_variation: "none" }).rate_variation.should.equal("None");
    });

    it("maps general_discrete -> GDD", function () {
      buildGard({ site_to_site_variation: "general_discrete" }).rate_variation.should.equal("GDD");
    });

    it("propagates a genetic_code=<value> into qsub_params for codon jobs (#393)", function () {
      var j = buildGard({ genetic_code: "Universal" });
      var joined = j.qsub_params.join(" ");
      // #393: HyPhy must receive --code for codon GARD; the param key is present
      // and carries the actual code, not an empty string.
      joined.should.match(/genetic_code=Universal/);
      joined.should.not.match(/genetic_code=(,|\s|$)/);
    });

    it("carries datatype=codon in qsub_params", function () {
      buildGard().qsub_params.join(" ").should.match(/datatype=codon/);
    });

    it("writes NO output files in checkOnly mode", function () {
      var j = buildGard();
      fs.existsSync(j.tree_fn).should.be.false();
      fs.existsSync(j.progress_fn).should.be.false();
    });
  });

  // =========================================================================
  // LAYER 1c — difFUBAR msaid derivation (#403) + qsub param capture.
  // difFubar has no checkOnly branch — it always calls init()->spawn(), which
  // hits jobRunner.submit(). We stub submit to capture qsub_params WITHOUT
  // calling sbatch, and read self.msaid (set synchronously pre-init).
  // =========================================================================
  describe("difFUBAR derived params (#403 msa[0]._id)", function () {

    var origSubmit;
    var captured;

    // difFUBAR always calls init()->spawn(), whose fs.writeFile callback later
    // invokes jobRunner.submit()/submit_slurm() -> sbatch. That callback fires
    // ASYNCHRONOUSLY, so a per-test (beforeEach/afterEach) stub can be restored
    // before the callback runs, letting a real sbatch through. To guarantee NO
    // job ever reaches the scheduler, install the stubs ONCE for the whole
    // block (before/after) and keep them installed across every async tick.
    var origSubmit, origSubmitSlurm, origSubmitLocal;

    function capture(a) { captured = a; }

    before(function () {
      origSubmit = jobMod.jobRunner.prototype.submit;
      origSubmitSlurm = jobMod.jobRunner.prototype.submit_slurm;
      origSubmitLocal = jobMod.jobRunner.prototype.submit_local;
      jobMod.jobRunner.prototype.submit = function (params) { capture(params); };
      jobMod.jobRunner.prototype.submit_slurm = function (script, cwd, slurm_params) { capture(slurm_params || script); };
      jobMod.jobRunner.prototype.submit_local = function (script, params) { capture(params); };
    });

    after(function () {
      jobMod.jobRunner.prototype.submit = origSubmit;
      jobMod.jobRunner.prototype.submit_slurm = origSubmitSlurm;
      jobMod.jobRunner.prototype.submit_local = origSubmitLocal;
    });

    beforeEach(function () { captured = null; });

    function buildDifFubar() {
      var params = {
        msa: [{ _id: "MSA-ABC-123", nj: TAGGED_TREE }],
        analysis: {
          _id: "DFB-JOB-1",
          tagged_nwk_tree: TAGGED_TREE,
          number_of_grid_points: 20,
          concentration_of_dirichlet_prior: 0.5,
          mcmc_iterations: 2500,
          burnin_samples: 500,
          pos_threshold: 0.95
        }
      };
      return new difFubarMod.difFubar(fakeSocket("dfb"), FASTA, params);
    }

    it("reads self.msaid from msa[0]._id, not undefined (#403)", function () {
      var j = buildDifFubar();
      should(j.msaid).equal("MSA-ABC-123");
    });

    it("uses the tagged tree in 'user' treemode when present", function () {
      var j = buildDifFubar();
      j.treemode.should.equal("user");
      j.nwk_tree.should.equal(TAGGED_TREE);
    });

    it("builds qsub_params carrying msaid=<msa[0]._id> (#403, stubbed submit)", function (done) {
      var j = buildDifFubar();
      // spawn() writes the input file async, then calls the (stubbed) submit.
      // Give the fs.writeFile callback a tick to run.
      var tries = 0;
      (function waitForCapture() {
        if (captured) {
          captured.join(" ").should.match(/msaid=MSA-ABC-123/);
          return done();
        }
        if (++tries > 50) return done(new Error("submit was never called"));
        setTimeout(waitForCapture, 20);
      })();
    });
  });

  // =========================================================================
  // LAYER 2 — The 'validated' checkOnly payload over the real v4 socket.
  // hyphyJob.validateParameters emits {valid,errors} then disconnects; it is
  // a NON-SLURM path, ideal for asserting the validation contract.
  // =========================================================================
  describe("validated payload over socket (checkOnly)", function () {
    this.timeout(10000);

    var PORT = 5321;
    var server;

    before(function () { server = harness.startServer(PORT); });
    after(function () { if (server) server.close(); });

    it("emits valid:true with no errors when required params are present", function (done) {
      var client = harness.connectClient(PORT);

      server.on("connection", function (socket) {
        harness.submitAndExpectStream(server, socket, "gard:spawn", function (s, stream, params) {
          new gardMod.gard(s, stream, params);
        });
      });

      client.on("validated", function (payload) {
        try {
          payload.should.have.property("valid");
          payload.should.have.property("errors");
          payload.valid.should.be.true();
          payload.errors.should.be.an.Array();
          payload.errors.length.should.equal(0);
          client.close();
          done();
        } catch (e) {
          client.close();
          done(e);
        }
      });

      client.on("connect", function () {
        harness.emitSpawn(client, "gard:spawn", FASTA, {
          checkOnly: true,
          analysis_type: "gard",
          genetic_code: "Universal",
          datatype: "codon",
          tree: TAGGED_TREE
        });
      });
    });

    it("emits valid:false listing missing analysis_type / genetic_code", function (done) {
      var client = harness.connectClient(PORT);

      server.on("connection", function (socket) {
        harness.submitAndExpectStream(server, socket, "gard:spawn2", function (s, stream, params) {
          new gardMod.gard(s, stream, params);
        });
      });

      client.on("validated", function (payload) {
        try {
          payload.valid.should.be.false();
          payload.errors.should.containEql("analysis_type is required");
          payload.errors.should.containEql("genetic_code is required");
          client.close();
          done();
        } catch (e) {
          client.close();
          done(e);
        }
      });

      client.on("connect", function () {
        // Deliberately omit analysis_type and genetic_code so validateParameters
        // pushes both errors. checkOnly routes through the shared validator.
        harness.emitSpawn(client, "gard:spawn2", FASTA, {
          checkOnly: true,
          datatype: "codon",
          tree: TAGGED_TREE
        });
      });
    });
  });

  // =========================================================================
  // LAYER 3 — Results DELIVERY via committed fixture (file -> Redis -> socket).
  // We construct the analysis in checkOnly mode (so nothing is submitted), then
  // repoint its results_fn at a tiny fixture and call onComplete() directly.
  // A ClientSocket subscribed to self.id must re-emit 'completed' carrying the
  // fixture contents. Uses LIVE Redis; no sbatch.
  // =========================================================================
  describe("results delivery path (fixture-driven onComplete, live Redis)", function () {
    this.timeout(10000);

    var tmpFiles = [];
    function tmp(name, contents) {
      var p = path.join(os.tmpdir(), "dm-valres-" + process.pid + "-" + name);
      fs.writeFileSync(p, contents);
      tmpFiles.push(p);
      return p;
    }
    after(function () {
      tmpFiles.forEach(function (p) { try { fs.unlinkSync(p); } catch (e) {} });
    });

    it("base hyphyJob.onComplete publishes fixture results and socket emits 'completed'", function (done) {
      // A minimal but valid FEL-shaped results fixture.
      var FEL_JSON = JSON.stringify({
        analysis: { info: "Contrast-FEL fixture" },
        MLE: { headers: [], content: {} }
      });
      var resultsFn = tmp("cfel.FEL.json", FEL_JSON);

      // Build a real cfel object (checkOnly => no submit, no files) and give it
      // a unique channel id + our fixture as its results file.
      var j = new cfelMod.cfel(fakeSocket("cfel-res"), FASTA, {
        checkOnly: true,
        genetic_code: "Universal",
        "branch-set": ["hi", "sup"],
        tree: TAGGED_TREE
      });
      j.id = "valres-cfel-" + process.pid + "-" + Date.now();
      j.results_fn = resultsFn;
      j.log = function () {}; // avoid noisy logger deps in the delivery path

      // Browser-facing socket: subscribe a ClientSocket to the job channel so
      // the Redis publish is re-emitted as a socket 'completed' event.
      var browser = fakeSocket("browser-cfel");
      var client_socket = new cs.ClientSocket(browser, j.id);

      browser.on("completed", function (packet) {
        try {
          packet.type.should.equal("completed");
          JSON.parse(packet.results).analysis.info.should.equal("Contrast-FEL fixture");
          client_socket.close();
          done();
        } catch (e) {
          client_socket.close();
          done(e);
        }
      });

      // Give the subscriber a moment to register, then trigger delivery.
      setTimeout(function () {
        j.onComplete();
      }, 300);
    });

    it("gard.onComplete sends nexus + publishes results (needs both fixtures)", function (done) {
      var GARD_JSON = JSON.stringify({
        analysis: { info: "GARD fixture" },
        breakpointData: {}
      });
      var resultsFn = tmp("gard.GARD.json", GARD_JSON);
      var nexusFn = tmp("gard.best-gard", "#NEXUS\nBEGIN TREES; END;\n");

      var j = new gardMod.gard(fakeSocket("gard-res"), FASTA, {
        checkOnly: true,
        genetic_code: "Universal",
        datatype: "codon",
        tree: TAGGED_TREE
      });
      j.id = "valres-gard-" + process.pid + "-" + Date.now();
      j.results_fn = resultsFn;
      j.finalout_results_fn = nexusFn;
      j.log = function () {};

      var browser = fakeSocket("browser-gard");
      var client_socket = new cs.ClientSocket(browser, j.id);

      var gotNexus = false;
      // gard.onComplete first calls sendNexusFile which emits 'gard nexus file'
      // directly on the analysis socket (j.socket), then publishes results to
      // Redis which the ClientSocket re-emits to the browser socket.
      j.socket.on("gard nexus file", function (pkt) {
        if (pkt && pkt.buffer) gotNexus = true;
      });

      browser.on("completed", function (packet) {
        try {
          packet.type.should.equal("completed");
          gotNexus.should.be.true();
          JSON.parse(packet.results).analysis.info.should.equal("GARD fixture");
          client_socket.close();
          done();
        } catch (e) {
          client_socket.close();
          done(e);
        }
      });

      setTimeout(function () {
        j.onComplete();
      }, 300);
    });
  });
});
