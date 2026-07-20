/**
 * Tests for the data-driven analysis route registry (Phase 3, #410).
 *
 * Verifies lib/routes/analysis-routes.js reproduces the routing server.js used
 * to declare by hand: the right route names, the right handler sets, and the
 * tree-merge behavior (standard analyses merge params.tree into a COPY of
 * params.job; bgm and difFubar pass params.job through without a tree merge).
 */

var should = require("should"); // eslint-disable-line no-unused-vars
var routes = require(__dirname + "/../../lib/routes/analysis-routes.js");

function collectRoutes() {
  var registered = {};
  var fakeR = { route: function (name, handlers) { registered[name] = handlers; } };
  var fakeSocket = { emit: function () {}, on: function () {} };
  routes.registerAnalysisRoutes(fakeR, fakeSocket, { hivtrace: {} });
  return registered;
}

describe("routes: analysis route registry", function () {
  it("registers all 17 analysis routes", function () {
    var r = collectRoutes();
    Object.keys(r).sort().should.eql([
      "absrel", "bgm", "bstill", "busted", "cfel", "difFubar", "fade", "fel",
      "fubar", "gard", "hivtrace", "meme", "multihit", "nrm", "prime",
      "relax", "slac"
    ]);
  });

  it("gives standard analyses spawn/check/resubscribe/cancel", function () {
    var r = collectRoutes();
    Object.keys(r.fel).sort().should.eql(["cancel", "check", "resubscribe", "spawn"]);
    Object.keys(r.bgm).sort().should.eql(["cancel", "check", "resubscribe", "spawn"]);
  });

  it("gives hivtrace only spawn/resubscribe (no check/cancel)", function () {
    var r = collectRoutes();
    Object.keys(r.hivtrace).sort().should.eql(["resubscribe", "spawn"]);
  });

  it("merges params.tree into a COPY of params.job for standard analyses (fel)", function () {
    var captured;
    routes.ANALYSES.forEach(function (e) {
      if (e[0] === "fel") e[1] = function (s, stream, jobParams) { captured = jobParams; };
    });
    var r = collectRoutes();
    var originalJob = { id: "J1", foo: 1 };
    r.fel.spawn("STREAM", { job: originalJob, tree: "(A,B);" });
    captured.tree.should.equal("(A,B);");
    captured.foo.should.equal(1);
    // original params.job must NOT be mutated (it's copied).
    should(originalJob.tree).equal(undefined);
  });

  it("does NOT merge tree for bgm (mergeTree:false)", function () {
    var captured;
    routes.ANALYSES.forEach(function (e) {
      if (e[0] === "bgm") e[1] = function (s, stream, jobParams) { captured = jobParams; };
    });
    var r = collectRoutes();
    r.bgm.spawn("STREAM", { job: { id: "J2", bar: 2 }, tree: "(C,D);" });
    should(captured.tree).equal(undefined);
    captured.bar.should.equal(2);
  });

  it("emits a script error and does not construct when params.job is missing", function () {
    var constructed = false;
    routes.ANALYSES.forEach(function (e) {
      if (e[0] === "fel") e[1] = function () { constructed = true; };
    });
    var registered = {};
    var emitted = null;
    var fakeR = { route: function (n, h) { registered[n] = h; } };
    var fakeSocket = { emit: function (ev, d) { emitted = { ev: ev, d: d }; }, on: function () {} };
    routes.registerAnalysisRoutes(fakeR, fakeSocket, { hivtrace: {} });
    registered.fel.spawn("STREAM", {}); // no .job
    constructed.should.be.false();
    emitted.ev.should.equal("script error");
  });
});
