/**
 * Completion lane: run every MPI HyPhy method to COMPLETION on the real
 * scheduler, each with its OWN fixture from test/<method>/res/.
 *
 * Why this exists: the per-method tests (test/<method>/*.js) submit a job
 * and cancel it. That proves submission, not that the job finishes, so they
 * stayed green through failures that only show up at run time: the missing
 * libmpi.so.40 that broke every production FUBAR job (#504), FADE's
 * mis-mapped MCMC flags, and fixtures HyPhy could not even parse. This lane
 * waits for the real terminal event and checks the results JSON.
 *
 * Cluster-only and opt-in (npm run test:complete). Needs config.json with
 * submit_type "slurm" (or "qsub") and a reachable redis, and runs on shared
 * storage. Skipped under submit_type "local" (CI).
 *
 * Jobs are constructed exactly as lib/routes/analysis-routes.js does
 * (new Ctor(socket, alignment, params)); a fake socket records the terminal
 * event. All methods are submitted up front and run concurrently.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const EventEmitter = require("events").EventEmitter;
const config = require("../../lib/config");

const ROOT = path.join(__dirname, "..", "..");
const PER_JOB_TIMEOUT_MS = 30 * 60 * 1000;

// method -> [ctor module, export name, fixture dir, alignment file, result key]
// `resultKey` is a top-level field every successful run of that analysis
// writes; asserting it catches a "completed" packet with an empty or error body.
const METHODS = {
  absrel: ["app/absrel/absrel.js", "absrel", "absrel", "Flu.fasta", "branch attributes"],
  bgm: ["app/bgm/bgm.js", "bgm", "bgm", "CD2.nex", "MLE"],
  bstill: ["app/bstill/bstill.js", "bstill", "bstill", "CD2.nex", "MLE"],
  busted: ["app/busted/busted.js", "busted", "busted", "5446bc0d355080301f18a8c6", "test results"],
  cfel: ["app/contrast-fel/cfel.js", "cfel", "contrast-fel", "Flu.fasta", "MLE"],
  fade: ["app/fade/fade.js", "fade", "fade", "CD2.aa.fasta", "MLE"],
  fel: ["app/fel/fel.js", "fel", "fel", "CD2.nex", "MLE"],
  fubar: ["app/fubar/fubar.js", "fubar", "fubar", "CD2.nex", "MLE"],
  gard: ["app/gard/gard.js", "gard", "gard", "CD2.nex", "breakpointData"],
  meme: ["app/meme/meme.js", "meme", "meme", "CD2.nex", "MLE"],
  multihit: ["app/multihit/multihit.js", "multihit", "multihit", "Flu.fasta", "fits"],
  nrm: ["app/nrm/nrm.js", "nrm", "nrm", "CD2.nex", "fits"],
  prime: ["app/prime/prime.js", "prime", "prime", "595a5dfd0483ab9a7959e731", "MLE"],
  relax: ["app/relax/relax.js", "relax", "relax", "Flu.fasta", "test results"],
  slac: ["app/slac/slac.js", "slac", "slac", "CD2.nex", "MLE"],
};

function runToCompletion(method) {
  const [mod, exp, dir, alnFile] = METHODS[method];
  const res = path.join(ROOT, "test", dir, "res");
  let params = JSON.parse(fs.readFileSync(path.join(res, "params.json"), "utf8"));
  if (params.job) params = params.job;
  // Unique, run-scoped id so concurrent runs and earlier results never collide.
  const id = "complete-" + method + "-" + process.pid;
  params._id = id;
  params.analysis = Object.assign({}, params.analysis || {}, { _id: id });
  const alignment = fs.readFileSync(path.join(res, alnFile), "utf8");

  return new Promise(function (resolve) {
    const socket = new EventEmitter();
    socket.id = "complete-" + method;
    socket.disconnect = function () {};
    let settled = false;
    const finish = function (event, payload) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ event: event, payload: payload });
    };
    socket.emit = function (event, payload) {
      if (event === "completed" || event === "script error") finish(event, payload);
      return true;
    };
    const timer = setTimeout(function () {
      finish("timeout", null);
    }, PER_JOB_TIMEOUT_MS);
    try {
      const Ctor = require(path.join(ROOT, mod))[exp];
      new Ctor(socket, alignment, params);
    } catch (e) {
      finish("construct error", { error: e.message });
    }
  });
}

describe("completion lane: every MPI method runs to completion on its own fixture", function () {
  this.timeout(PER_JOB_TIMEOUT_MS + 60 * 1000);
  const runs = {};

  before(function () {
    if (config.submit_type !== "slurm" && config.submit_type !== "qsub") {
      this.skip();
      return;
    }
    // Submit everything up front so the lane takes as long as the slowest job.
    Object.keys(METHODS).forEach(function (m) {
      runs[m] = runToCompletion(m);
    });
  });

  Object.keys(METHODS).forEach(function (method) {
    it(method + " completes and returns results", async function () {
      const r = await runs[method];
      const detail = r.payload && (r.payload.details || r.payload.error);
      assert.strictEqual(
        r.event,
        "completed",
        method + " ended with '" + r.event + "': " + String(detail || "").slice(0, 500)
      );
      let results = r.payload.results !== undefined ? r.payload.results : r.payload;
      if (typeof results === "string") results = JSON.parse(results);
      const key = METHODS[method][4];
      assert.ok(
        results && Object.prototype.hasOwnProperty.call(results, key),
        method + " results are missing '" + key + "' (keys: " + Object.keys(results || {}).slice(0, 12).join(", ") + ")"
      );
    });
  });
});
