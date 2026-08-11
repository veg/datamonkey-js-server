/**
 * Live-redis pub/sub tests for lib/mcp/job-notifier.js (issue #379).
 *
 * These mirror the live-PUBSUB regression discipline already used by
 * lib/redis-client.js / lib/clientsocket.js: they exercise the real redis
 * connection (createSubscriber) rather than mocking it, because the whole point
 * of the notifier is the subscribe -> notify -> unsubscribe/quit lifecycle. A
 * spy McpServer records sendLoggingMessage calls so we can assert the
 * notification shape without a real MCP client.
 *
 * The tests are gated on redis being reachable; if the shared client can't
 * connect they skip rather than fail (matching the other integration-ish tests).
 */

const chai = require("chai");
const expect = chai.expect;

const { createJobNotifier, MAX_SUBSCRIPTIONS } = require("../../lib/mcp/job-notifier");
const redisClient = require("../../lib/redis-client");

// Build a spy McpServer exposing server.sendLoggingMessage(params, sessionId).
function makeSpyServer() {
  const calls = [];
  return {
    calls: calls,
    server: {
      sendLoggingMessage: function (params, sessionId) {
        calls.push({ params: params, sessionId: sessionId });
      }
    }
  };
}

// Poll a predicate until it's true or we time out.
function waitFor(pred, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 2000);
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

describe("MCP job-notifier (#379)", function () {
  this.timeout(15000);

  let redisAvailable = false;

  before(async function () {
    try {
      await redisClient.ready;
      // A cheap round-trip to confirm the socket is really up.
      await redisClient.client.ping();
      redisAvailable = true;
    } catch (e) {
      redisAvailable = false;
    }
  });

  beforeEach(function () {
    if (!redisAvailable) this.skip();
  });

  it("fires an info notification and unsubscribes on completion", async function () {
    const spy = makeSpyServer();
    const notifier = createJobNotifier(spy);
    notifier.sessionId = "s1";

    const jobId = "test-job-379-complete-" + Date.now();
    await notifier.watch(jobId, "fel");

    // Give the subscribe a beat to attach, then publish a completion packet.
    await waitFor(function () { return notifier.subscriptions.get(jobId) && notifier.subscriptions.get(jobId).subscriber; }, 3000);
    await redisClient.client.publish(jobId, JSON.stringify({ type: "completed" }));

    await waitFor(function () { return spy.calls.length === 1; }, 3000);

    const call = spy.calls[0];
    expect(call.sessionId).to.equal("s1");
    expect(call.params.level).to.equal("info");
    expect(call.params.logger).to.equal("datamonkey/job");
    expect(call.params.data.event).to.equal("job_completed");
    expect(call.params.data.job_id).to.equal(jobId);
    expect(call.params.data.analysis_type).to.equal("fel");
    expect(call.params.data.status).to.equal("completed");

    // Unsubscribed after firing.
    expect(notifier.subscriptions.size).to.equal(0);

    // A subsequent publish must NOT fire again (we unsubscribed).
    await redisClient.client.publish(jobId, JSON.stringify({ type: "completed" }));
    await new Promise(function (r) { setTimeout(r, 150); });
    expect(spy.calls.length).to.equal(1);
  });

  it("fires an error notification with the error string and unsubscribes", async function () {
    const spy = makeSpyServer();
    const notifier = createJobNotifier(spy);
    notifier.sessionId = "s2";

    const jobId = "test-job-379-error-" + Date.now();
    await notifier.watch(jobId, "busted");
    await waitFor(function () { return notifier.subscriptions.get(jobId) && notifier.subscriptions.get(jobId).subscriber; }, 3000);

    await redisClient.client.publish(jobId, JSON.stringify({ type: "script error", error: "boom" }));
    await waitFor(function () { return spy.calls.length === 1; }, 3000);

    const call = spy.calls[0];
    expect(call.params.level).to.equal("error");
    expect(call.params.data.event).to.equal("job_failed");
    expect(call.params.data.status).to.equal("error");
    expect(call.params.data.error).to.equal("boom");
    expect(notifier.subscriptions.size).to.equal(0);
  });

  it("drops a malformed pub/sub message without throwing or firing", async function () {
    const spy = makeSpyServer();
    const notifier = createJobNotifier(spy);
    notifier.sessionId = "s3";

    const jobId = "test-job-379-malformed-" + Date.now();
    await notifier.watch(jobId, "meme");
    await waitFor(function () { return notifier.subscriptions.get(jobId) && notifier.subscriptions.get(jobId).subscriber; }, 3000);

    await redisClient.client.publish(jobId, "this is not json {");
    await new Promise(function (r) { setTimeout(r, 200); });

    // No notification, still subscribed (message dropped, not fatal).
    expect(spy.calls.length).to.equal(0);
    expect(notifier.subscriptions.size).to.equal(1);

    await notifier.closeAll();
  });

  it("closeAll tears down every subscriber (transport.onclose leak guard)", async function () {
    const spy = makeSpyServer();
    const notifier = createJobNotifier(spy);
    notifier.sessionId = "s4";

    const jobId = "test-job-379-closeall-" + Date.now();
    await notifier.watch(jobId, "slac");
    await waitFor(function () { return notifier.subscriptions.get(jobId) && notifier.subscriptions.get(jobId).subscriber; }, 3000);

    await notifier.closeAll();
    expect(notifier.subscriptions.size).to.equal(0);

    // A later publish fires nothing.
    await redisClient.client.publish(jobId, JSON.stringify({ type: "completed" }));
    await new Promise(function (r) { setTimeout(r, 150); });
    expect(spy.calls.length).to.equal(0);
  });

  it("caps concurrent subscriptions per session", async function () {
    const spy = makeSpyServer();
    const notifier = createJobNotifier(spy);
    notifier.sessionId = "s5";

    const stamp = Date.now();
    const watches = [];
    for (let i = 0; i < MAX_SUBSCRIPTIONS + 5; i++) {
      watches.push(notifier.watch("test-job-379-cap-" + stamp + "-" + i, "fel"));
    }
    await Promise.all(watches);

    // At most the cap; the surplus was refused (no-op).
    expect(notifier.subscriptions.size).to.equal(MAX_SUBSCRIPTIONS);

    await notifier.closeAll();
    expect(notifier.subscriptions.size).to.equal(0);
  });

  it("does not leak when closeAll races an in-flight watch() connect", async function () {
    const spy = makeSpyServer();
    const notifier = createJobNotifier(spy);
    notifier.sessionId = "s6";

    const jobId = "test-job-379-race-" + Date.now();
    // Do NOT await watch — call closeAll synchronously before the subscriber
    // connect resolves, exercising the _closed-flag race path.
    const watchPromise = notifier.watch(jobId, "fel");
    await notifier.closeAll();
    await watchPromise;

    // The racing connect must have torn itself down; nothing left in the map.
    expect(notifier.subscriptions.size).to.equal(0);

    await redisClient.client.publish(jobId, JSON.stringify({ type: "completed" }));
    await new Promise(function (r) { setTimeout(r, 150); });
    expect(spy.calls.length).to.equal(0);
  });
});
