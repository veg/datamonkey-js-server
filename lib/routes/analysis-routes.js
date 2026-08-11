/**
 * lib/routes/analysis-routes.js — data-driven analysis route registry (Phase 3, #410).
 *
 * server.js used to declare 18 near-identical `r.route("<analysis>", {...})`
 * blocks, each wiring the same spawn / check / resubscribe / cancel handlers
 * that just do `new X.X(socket, stream, jobWithTree)`. This module replaces the
 * 16 standard blocks with a data table + a generated handler set, and keeps the
 * genuinely-special hivtrace analysis as an explicit entry.
 *
 * Behavior is preserved exactly:
 *   - standard spawn: validate params.job, merge params.tree into a copy of
 *     params.job (unless mergeTree:false), then `new Ctor(socket, stream, job)`;
 *   - check: set checkOnly on params.job, `new Ctor(socket, null, params.job)`;
 *   - resubscribe / cancel: delegate to job.resubscribe / job.cancel.
 */

const job = require("../../app/job.js");
const logger = require("../logger.js").logger;

// The analysis route table. Each entry: [routeName, constructor, options].
// options.mergeTree (default true) — whether spawn merges params.tree into the
// job params (bgm and difFubar pass params.job directly, no tree merge).
const ANALYSES = [
  ["absrel", require("../../app/absrel/absrel.js").absrel],
  ["bgm", require("../../app/bgm/bgm.js").bgm, { mergeTree: false }],
  ["bstill", require("../../app/bstill/bstill.js").bstill],
  ["busted", require("../../app/busted/busted.js").busted],
  ["cfel", require("../../app/contrast-fel/cfel.js").cfel],
  ["difFubar", require("../../app/difFubar/difFubar.js").difFubar, { mergeTree: false }],
  ["fade", require("../../app/fade/fade.js").fade],
  ["fel", require("../../app/fel/fel.js").fel],
  ["fubar", require("../../app/fubar/fubar.js").fubar],
  ["gard", require("../../app/gard/gard.js").gard],
  ["meme", require("../../app/meme/meme.js").meme],
  ["multihit", require("../../app/multihit/multihit.js").multihit],
  ["nrm", require("../../app/nrm/nrm.js").nrm],
  ["prime", require("../../app/prime/prime.js").prime],
  ["relax", require("../../app/relax/relax.js").relax],
  ["slac", require("../../app/slac/slac.js").slac]
];

// Build the standard {spawn, check, resubscribe, cancel} handler set for one
// analysis, closed over the connection socket.
function standardHandlers(socket, name, Ctor, options) {
  const mergeTree = !(options && options.mergeTree === false);
  return {
    spawn: function (stream, params) {
      if (!params || !params.job) {
        logger.error(name + " spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      let jobParams = params.job;
      if (mergeTree) {
        jobParams = Object.assign({}, params.job);
        if (params.tree) {
          jobParams.tree = params.tree;
        }
      }
      new Ctor(socket, stream, jobParams);
    },
    check: function (params) {
      params.job["checkOnly"] = true;
      new Ctor(socket, null, params.job);
    },
    resubscribe: function (params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function (params) {
      new job.cancel(socket, params.id);
    }
  };
}

/**
 * Register all analysis routes on a router (`r = new router.io(socket)`).
 * Reproduces the exact routes server.js declared by hand.
 *
 * @param {{ route: (name: string, handlers: object) => void }} r  the per-socket
 *   router (lib/router.js io instance)
 * @param {object} socket  the connection socket
 * @param {{ hivtrace: { hivtrace: Function } }} deps
 *   the special analysis' constructor module
 */
function registerAnalysisRoutes(r, socket, deps) {
  ANALYSES.forEach(function (entry) {
    const name = entry[0];
    const Ctor = entry[1];
    const options = entry[2];
    r.route(name, standardHandlers(socket, name, Ctor, options));
  });

  // --- Special cases (kept explicit; they don't fit the standard template) ---

  // HIV-TRACE: constructed from params.job.analysis, no check/cancel route.
  r.route("hivtrace", {
    spawn: function (stream, params) {
      new deps.hivtrace.hivtrace(socket, stream, params.job.analysis);
    },
    resubscribe: function (params) {
      new job.resubscribe(socket, params.id);
    }
  });
}

module.exports = { registerAnalysisRoutes: registerAnalysisRoutes, ANALYSES: ANALYSES };
