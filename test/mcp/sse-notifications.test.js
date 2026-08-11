/**
 * SSE job-completion notification SEAM tests (issue #379).
 *
 * WHY THIS FILE EXISTS (vs test/mcp/job-notifier.test.js)
 * ------------------------------------------------------
 * job-notifier.test.js drives the notifier module DIRECTLY (watch/unwatch/
 * closeAll). This file instead exercises the WIRING SEAM the way production
 * does it: it constructs a real per-session notifier, hands it to
 * registerTools() (exactly as lib/mcp/index.js:createMcpServer does), and then
 * proves that:
 *
 *   1. spawn_analysis subscribes the session to the job's redis channel, so a
 *      {type:"completed"} packet PUBLISHED to that job_id channel routes an MCP
 *      logging notification to the right session — with the right job_id/status
 *      — and then the subscriber is unsubscribed (no leak).
 *   2. cancel_job unwatches (a cancelled job never publishes a terminal packet,
 *      so the seam must proactively tear the subscriber down).
 *   3. transport.onclose semantics (notifier.closeAll) tear down EVERY watched
 *      subscriber for the session, so a client that disconnects mid-job leaks
 *      nothing.
 *
 * These run against LIVE redis (config = test/fixtures/config.ci.json copied to
 * config.json by the test:mcp / test:ci harness). If redis is unreachable the
 * tests skip rather than fail, matching the other integration-ish MCP suites.
 *
 * spawn_analysis is stubbed at the spawnHelpers seam so we never touch SLURM or
 * the filesystem — only the notifier subscribe/publish/teardown lifecycle is
 * under test.
 */

const chai = require("chai");
const expect = chai.expect;

const spawnHelpers = require("../../lib/mcp/spawn-helpers");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { registerTools } = require("../../lib/mcp/tools");
const { createJobNotifier } = require("../../lib/mcp/job-notifier");
const jobdel = require("../../lib/jobdel");
const redisClient = require("../../lib/redis-client");

// Invoke a registered MCP tool by name (same helper style as mcp.test.js).
async function callTool(mcpServer, name, args) {
  var tool = mcpServer._registeredTools[name];
  if (!tool) throw new Error("Tool not registered: " + name);
  return tool.handler(args || {});
}

// Poll a predicate until true or timeout.
function waitFor(pred, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 3000);
  return new Promise(function (resolve, reject) {
    (function poll() {
      let ok = false;
      try {
        ok = pred();
      } catch (e) {
        ok = false;
      }
      if (ok) return resolve();
      if (Date.now() > deadline) return reject(new Error("timeout waiting for condition"));
      setTimeout(poll, 15);
    })();
  });
}

describe("MCP SSE job-completion notifications – seam (#379)", function () {
  this.timeout(15000);

  var redisAvailable = false;

  // A spy McpServer whose server.sendLoggingMessage records calls, so we can
  // assert the notification shape without a real MCP client. We still register
  // the REAL tools against it so spawn_analysis/cancel_job drive the real
  // notifier.watch/unwatch wiring.
  function makeSpyServer() {
    var mcp = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {}, logging: {} } }
    );
    mcp._sseCalls = [];
    // Override the seam the notifier uses to push SSE notifications.
    mcp.server.sendLoggingMessage = function (params, sessionId) {
      mcp._sseCalls.push({ params: params, sessionId: sessionId });
      return Promise.resolve();
    };
    return mcp;
  }

  // Stub spawnAnalysis so no SLURM/filesystem work happens; return a unique id.
  var originalSpawnAnalysis;
  before(async function () {
    try {
      await redisClient.ready;
      await redisClient.client.ping();
      redisAvailable = true;
    } catch (e) {
      redisAvailable = false;
    }

    originalSpawnAnalysis = spawnHelpers.spawnAnalysis;
    spawnHelpers.spawnAnalysis = function (type) {
      if (!spawnHelpers.analysisMap[type]) {
        throw new Error("Unknown analysis type: " + type);
      }
      // Unique per call so parallel-ish tests never collide on a channel.
      return "sse-seam-job-" + process.pid + "-" + Date.now() + "-" +
        Math.floor(Math.random() * 1e6);
    };
  });

  after(function () {
    spawnHelpers.spawnAnalysis = originalSpawnAnalysis;
  });

  beforeEach(function () {
    if (!redisAvailable) this.skip();
  });

  it("spawn_analysis subscribes; a published {type:completed} fires the SSE notification and unsubscribes (no leak)", async function () {
    var mcp = makeSpyServer();
    var notifier = createJobNotifier(mcp);
    notifier.sessionId = "seam-session-1";
    registerTools(mcp, redisClient.client, notifier);

    var result = await callTool(mcp, "spawn_analysis", {
      analysis_type: "fel",
      alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n"
    });
    expect(result.isError).to.not.be.true;
    var jobId = JSON.parse(result.content[0].text).job_id;
    expect(jobId).to.be.a("string").with.length.above(0);

    // Wait for the async subscribe to actually attach before publishing.
    await waitFor(function () {
      var e = notifier.subscriptions.get(jobId);
      return e && e.subscriber;
    }, 4000);

    await redisClient.client.publish(jobId, JSON.stringify({ type: "completed" }));

    // The notification should route through sendLoggingMessage exactly once.
    await waitFor(function () { return mcp._sseCalls.length === 1; }, 4000);

    var call = mcp._sseCalls[0];
    expect(call.sessionId).to.equal("seam-session-1");
    expect(call.params.level).to.equal("info");
    expect(call.params.data.event).to.equal("job_completed");
    expect(call.params.data.job_id).to.equal(jobId);
    expect(call.params.data.status).to.equal("completed");
    expect(call.params.data.analysis_type).to.equal("fel");

    // Subscriber torn down after firing — no leak.
    expect(notifier.subscriptions.size).to.equal(0);

    // A second publish must NOT fire again (we unsubscribed).
    await redisClient.client.publish(jobId, JSON.stringify({ type: "completed" }));
    await new Promise(function (r) { setTimeout(r, 150); });
    expect(mcp._sseCalls.length).to.equal(1);
  });

  it("a published {type:'script error'} routes an error notification with the error string", async function () {
    var mcp = makeSpyServer();
    var notifier = createJobNotifier(mcp);
    notifier.sessionId = "seam-session-err";
    registerTools(mcp, redisClient.client, notifier);

    var result = await callTool(mcp, "spawn_analysis", {
      analysis_type: "busted",
      alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n"
    });
    var jobId = JSON.parse(result.content[0].text).job_id;

    await waitFor(function () {
      var e = notifier.subscriptions.get(jobId);
      return e && e.subscriber;
    }, 4000);

    await redisClient.client.publish(
      jobId,
      JSON.stringify({ type: "script error", error: "kaboom" })
    );
    await waitFor(function () { return mcp._sseCalls.length === 1; }, 4000);

    var call = mcp._sseCalls[0];
    expect(call.params.level).to.equal("error");
    expect(call.params.data.event).to.equal("job_failed");
    expect(call.params.data.status).to.equal("error");
    expect(call.params.data.error).to.equal("kaboom");
    expect(notifier.subscriptions.size).to.equal(0);
  });

  it("cancel_job unwatches the job (cancelled jobs never publish a terminal packet)", async function () {
    var mcp = makeSpyServer();
    var notifier = createJobNotifier(mcp);
    notifier.sessionId = "seam-session-cancel";
    registerTools(mcp, redisClient.client, notifier);

    // Spawn to get a watched job_id.
    var result = await callTool(mcp, "spawn_analysis", {
      analysis_type: "fel",
      alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n"
    });
    var jobId = JSON.parse(result.content[0].text).job_id;

    await waitFor(function () {
      var e = notifier.subscriptions.get(jobId);
      return e && e.subscriber;
    }, 4000);
    expect(notifier.subscriptions.size).to.equal(1);

    // Drive the REAL cancel path (running job + valid torque_id) — that is the
    // branch that calls notifier.unwatch(). The "already aborted/completed"
    // short-circuits return before the unwatch, so they don't exercise the seam.
    // Stub jobdel.jobDelete so we never touch the real scheduler, exactly the
    // way mcp.test.js stubs spawnHelpers.spawnAnalysis.
    var originalJobDelete = jobdel.jobDelete;
    jobdel.jobDelete = function (torqueId, cb) { cb(null); };
    await redisClient.client.hSet(jobId, {
      status: "running",
      torque_id: JSON.stringify({ torque_id: "12345.scheduler" })
    });
    try {
      var cancel = await callTool(mcp, "cancel_job", { job_id: jobId });
      expect(cancel.isError).to.not.be.true;
      expect(JSON.parse(cancel.content[0].text).success).to.be.true;

      // The seam must have unwatched the job so no subscriber leaks.
      await waitFor(function () { return notifier.subscriptions.size === 0; }, 3000);
      expect(notifier.subscriptions.size).to.equal(0);
    } finally {
      jobdel.jobDelete = originalJobDelete;
      try { await redisClient.client.del(jobId); } catch (e) { /* best effort */ }
    }
  });

  it("transport.onclose (closeAll) tears down every watched subscriber for the session", async function () {
    var mcp = makeSpyServer();
    var notifier = createJobNotifier(mcp);
    notifier.sessionId = "seam-session-close";
    registerTools(mcp, redisClient.client, notifier);

    // Spawn three jobs; all three should be watched concurrently.
    var jobIds = [];
    for (var i = 0; i < 3; i++) {
      var r = await callTool(mcp, "spawn_analysis", {
        analysis_type: "fel",
        alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n"
      });
      jobIds.push(JSON.parse(r.content[0].text).job_id);
    }

    await waitFor(function () {
      if (notifier.subscriptions.size !== 3) return false;
      return jobIds.every(function (id) {
        var e = notifier.subscriptions.get(id);
        return e && e.subscriber;
      });
    }, 5000);
    expect(notifier.subscriptions.size).to.equal(3);

    // Simulate transport.onclose -> teardownSession -> notifier.closeAll().
    await notifier.closeAll();
    expect(notifier.subscriptions.size).to.equal(0);

    // A post-close publish to any of the channels must fire nothing.
    await redisClient.client.publish(jobIds[0], JSON.stringify({ type: "completed" }));
    await new Promise(function (r) { setTimeout(r, 150); });
    expect(mcp._sseCalls.length).to.equal(0);
  });
});
