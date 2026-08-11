/**
 * Per-session MCP job-completion notifier.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Issue #379: MCP clients (Claude, Claude Code) that call spawn_analysis want to
 * be told when the job finishes instead of polling get_job_status forever. The
 * job runner already publishes a terminal packet on the redis channel named by
 * the job id (hyphyjob.js finalizeCompletion publishes {type:"completed"} and
 * onError publishes {type:"script error"}). This module subscribes to that
 * channel for the lifetime of the job and, on a terminal packet, pushes an MCP
 * logging notification (notifications/message) down the session's SSE stream so
 * a human sees it inline. This is ADDITIVE — get_job_status polling is untouched
 * and remains the source of truth for clients that don't consume SSE.
 *
 * DELIVERY IS BEST-EFFORT (fire-and-forget) — NOT lossless
 * --------------------------------------------------------
 * The SSE completion event CAN be missed and there is no retry:
 *   - The StreamableHTTP transport is created with NO eventStore, so a
 *     notification sent on the standalone GET stream before the client has
 *     opened it (or during any reconnect gap) is SILENTLY DROPPED by the SDK
 *     (it early-returns when the standalone stream is undefined; nothing is
 *     buffered or replayable).
 *   - Redis pub/sub has no retention either: the runner's terminal publish
 *     fires from finalizeCompletion regardless of whether a subscriber is
 *     attached yet, so a completion that races the subscribe is lost.
 * This does NOT hang the client: get_job_status polling is the fallback and the
 * source of truth. A client MUST reconcile final state via get_job_status and
 * treat the SSE event purely as an optimization. If lossless delivery is ever
 * required, configure an eventStore on the transport so standalone-stream
 * notifications are stored for replay on (re)connect.
 *
 * LIFECYCLE (the risk — see leak fixes #397/#400)
 * -----------------------------------------------
 * Every subscription MUST be torn down on BOTH:
 *   (a) the terminal notification firing (unwatch after sendLoggingMessage), AND
 *   (b) session close (transport.onclose -> closeAll).
 * A client that disconnects mid-job must not leak a redis subscriber. We mirror
 * the clientsocket.js pattern exactly: an entry is stored synchronously with a
 * _closed guard the moment watch() begins, so a session close racing the async
 * createSubscriber() connect tears the fresh subscriber down instead of leaking
 * it. Concurrent subscriptions per session are capped (MAX_SUBSCRIPTIONS).
 *
 * redis@5: the subscriber is a SEPARATE connection (createSubscriber). JSON.parse
 * of pub/sub messages is guarded so a malformed publish can never crash.
 */

const { createSubscriber } = require("../redis-client"),
  logger = require("../logger").logger;

// Cap concurrent job subscriptions per session so a client spamming
// spawn_analysis can't create unbounded redis connections. Jobs beyond the cap
// simply fall back to get_job_status polling.
const MAX_SUBSCRIPTIONS = 25;

// Hard TTL on a single job subscription. A runner that dies / times out without
// ever publishing a terminal packet (or a job cancelled out-of-band) would
// otherwise pin its redis subscriber for the life of the session, eventually
// exhausting MAX_SUBSCRIPTIONS so NEW jobs silently lose SSE. After this
// wallclock the watch is torn down unconditionally; the client still gets the
// truth from get_job_status. Sized generously above the longest expected job.
const WATCH_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Create a per-session job notifier bound to one McpServer instance.
 *
 * @param {{ server: { sendLoggingMessage: Function } }} mcpServer
 *   Any object exposing `server.sendLoggingMessage(params, sessionId)`. In
 *   production this is the SDK McpServer; tests inject a spy.
 * @returns {object} notifier with watch/unwatch/closeAll + `subscriptions` Map
 */
function createJobNotifier(mcpServer) {
  // job_id -> { subscriber, channel, _closed, _notified, _toreDown, ttlTimer }
  const subscriptions = new Map();

  const notifier = {
    mcpServer: mcpServer,
    // sessionId is assigned lazily by index.js after transport connect, since
    // the transport's sessionId isn't known until connect() runs.
    sessionId: undefined,
    subscriptions: subscriptions,
    MAX_SUBSCRIPTIONS: MAX_SUBSCRIPTIONS,
    watch: watch,
    unwatch: unwatch,
    closeAll: closeAll
  };

  /**
   * Send an MCP logging notification for a terminal job packet down this
   * session's SSE stream. The structured payload lives in `data` so a client
   * that parses it programmatically still gets job_id/status/analysis_type; the
   * human-readable summary is in `data.message`.
   */
  function sendNotification(packet, job_id, analysis_type) {
    const isError = packet.type === "script error";
    const type_label = analysis_type || "analysis";
    let message, error;
    if (isError) {
      error = packet.error !== undefined ? String(packet.error) : "unknown error";
      message =
        "Analysis " + type_label + " job " + job_id + " failed: " + error;
    } else {
      message = "Analysis " + type_label + " job " + job_id + " completed";
    }

    const data = {
      event: isError ? "job_failed" : "job_completed",
      job_id: job_id,
      analysis_type: analysis_type || null,
      status: isError ? "error" : "completed",
      message: message
    };
    if (isError) {
      data.error = error;
    }

    // sendLoggingMessage can fail two ways on a torn-down transport, and BOTH
    // happen in the 'client disconnects mid-job' race (the terminal redis
    // message can arrive after the transport is gone but before/around
    // closeAll): (1) it THROWS synchronously ("Not connected" when the SDK's
    // _transport is falsy), and (2) transport.send can REJECT the returned
    // promise. The try/catch only covers (1); we must also .catch the rejection
    // so it doesn't surface as an unhandled promise rejection and crash/log.
    try {
      // sessionId is the 2nd arg — pass the per-session transport.sessionId so
      // the SDK routes to the correct session's SSE stream.
      const result = mcpServer.server.sendLoggingMessage(
        {
          level: isError ? "error" : "info",
          logger: "datamonkey/job",
          data: data
        },
        notifier.sessionId
      );
      Promise.resolve(result)
        .then(function () {
          logger.info(
            "MCP job-notifier: sent " + data.event + " for job_id=" + job_id +
              " session=" + (notifier.sessionId || "none")
          );
        })
        .catch(function (err) {
          logger.error(
            "MCP job-notifier: sendLoggingMessage rejected for job_id=" +
              job_id + ": " + err.message
          );
        });
    } catch (err) {
      logger.error(
        "MCP job-notifier: sendLoggingMessage failed for job_id=" + job_id +
          ": " + err.message
      );
    }
  }

  /**
   * Subscribe to a job's redis channel and notify this session on completion.
   * Idempotent per job_id; no-ops beyond MAX_SUBSCRIPTIONS. Never throws — a
   * subscriber failure must not fail spawn_analysis (the job still runs and the
   * client can poll get_job_status).
   *
   * @param {string} job_id
   * @param {string} [analysis_type]
   * @returns {Promise<void>}
   */
  function watch(job_id, analysis_type) {
    if (!job_id) return Promise.resolve();

    if (subscriptions.has(job_id)) {
      // Already watching this job — don't double-subscribe.
      return Promise.resolve();
    }

    if (subscriptions.size >= MAX_SUBSCRIPTIONS) {
      logger.warn(
        "MCP job-notifier: subscription cap (" + MAX_SUBSCRIPTIONS +
          ") reached for session=" + (notifier.sessionId || "none") +
          "; job_id=" + job_id + " will fall back to get_job_status polling"
      );
      return Promise.resolve();
    }

    // Store the entry SYNCHRONOUSLY (before the async connect) with a _closed
    // guard, so a closeAll() racing the createSubscriber() connect tears the
    // fresh subscriber down instead of leaking it. Mirrors clientsocket.js.
    //   _notified  — set true synchronously the first time a terminal packet is
    //                handled, so a duplicate terminal delivery (before the async
    //                unsubscribe takes effect) can't fire the notification twice.
    //   _toreDown  — set true once the real quit() chain has been initiated, so
    //                teardownEntry is strictly idempotent (no double quit()).
    //   ttlTimer   — hard-TTL reaper; cleared in teardownEntry.
    const entry = {
      subscriber: null,
      channel: job_id,
      _closed: false,
      _notified: false,
      _toreDown: false,
      ttlTimer: null
    };
    subscriptions.set(job_id, entry);

    // Bound the subscription's lifetime so a runner that dies without ever
    // publishing a terminal packet can't pin this subscriber forever.
    entry.ttlTimer = setTimeout(function () {
      entry.ttlTimer = null;
      if (subscriptions.get(job_id) === entry) {
        logger.warn(
          "MCP job-notifier: watch TTL expired for job_id=" + job_id +
            " session=" + (notifier.sessionId || "none") +
            "; tearing down (client should reconcile via get_job_status)"
        );
        unwatch(job_id);
      }
    }, WATCH_TTL_MS);
    // Don't let the reaper timer keep the event loop alive.
    if (entry.ttlTimer && typeof entry.ttlTimer.unref === "function") {
      entry.ttlTimer.unref();
    }

    logger.info(
      "MCP job-notifier: watching job_id=" + job_id +
        " type=" + (analysis_type || "unknown") +
        " session=" + (notifier.sessionId || "none")
    );

    return createSubscriber()
      .then(function (subscriber) {
        entry.subscriber = subscriber;

        // If closeAll()/unwatch() already fired while we were connecting, tear
        // the fresh connection down immediately instead of leaking it.
        if (entry._closed) {
          return teardownEntry(entry);
        }

        return subscriber.subscribe(job_id, function (message) {
          let packet;
          try {
            packet = JSON.parse(message);
          } catch (err) {
            // A malformed publish must never crash the process. Drop it and
            // keep the subscription alive (mirrors clientsocket.js guard).
            logger.error(
              "MCP job-notifier: bad pub/sub message on channel " + job_id +
                ": " + err.message
            );
            return;
          }

          if (packet.type === "completed" || packet.type === "script error") {
            // Fire EXACTLY ONCE per job. unsubscribe() below is async, so a
            // second terminal packet delivered in the same batch (or before the
            // unsubscribe takes effect) would otherwise re-enter here and notify
            // again. Guard synchronously with a check-and-set on the entry so a
            // duplicate delivery is a no-op regardless of unsubscribe latency.
            const current = subscriptions.get(job_id);
            if (!current || current._notified) return;
            current._notified = true;
            sendNotification(packet, job_id, analysis_type);
            // Terminal — tear this subscriber down.
            unwatch(job_id);
          }
          // Any other packet type (progress/status) is ignored here; the SSE
          // notification vehicle is only for terminal events.
        });
      })
      .catch(function (err) {
        logger.error(
          "MCP job-notifier: failed to subscribe job_id=" + job_id + ": " +
            err.message
        );
        // Best-effort cleanup so a failed connect/subscribe leaves no phantom
        // map entry, no pending TTL timer, and no orphaned subscriber (subscribe
        // can reject after entry.subscriber was set). teardownEntry clears the
        // timer and releases any connected socket idempotently.
        subscriptions.delete(job_id);
        return teardownEntry(entry);
      });
  }

  /**
   * Stop watching a job and tear its subscriber down. Idempotent.
   * @param {string} job_id
   * @returns {Promise<void>}
   */
  function unwatch(job_id) {
    const entry = subscriptions.get(job_id);
    if (!entry) return Promise.resolve();
    subscriptions.delete(job_id);
    return teardownEntry(entry);
  }

  /**
   * Tear every watched subscriber down. Called from transport.onclose so a
   * disconnecting client leaks nothing. Never throws.
   * @returns {Promise<void>}
   */
  function closeAll() {
    const entries = Array.from(subscriptions.values());
    subscriptions.clear();
    logger.info(
      "MCP job-notifier: closeAll tearing down " + entries.length +
        " subscription(s) for session=" + (notifier.sessionId || "none")
    );
    return Promise.all(
      entries.map(function (entry) {
        return teardownEntry(entry);
      })
    ).then(function () {}, function () {});
  }

  /**
   * Unsubscribe + quit a single subscriber connection. redis@5 is
   * promise-native; quit() resolves on graceful close, and we fall back to
   * destroy() on error to force the socket shut (mirrors clientsocket.js
   * _teardown).
   *
   * STRICTLY IDEMPOTENT. Two flags carry distinct meaning:
   *   _closed    — "no further watching": set the moment teardown is requested,
   *                so a closeAll() that races an in-flight createSubscriber()
   *                connect flags the entry BEFORE the subscriber exists; the
   *                connect .then then re-invokes teardownEntry to release the
   *                now-connected socket. Because _closed alone does not prove a
   *                quit already ran, it cannot be the idempotency guard.
   *   _toreDown  — "the real quit() chain has been initiated": set exactly once,
   *                the first time we actually have a subscriber to release. This
   *                is what makes a double call issue exactly ONE quit(): the
   *                second call sees _toreDown and returns, even if some future
   *                caller re-populates entry.subscriber.
   *
   * Contract: teardownEntry called twice on a connected entry issues exactly one
   * unsubscribe()+quit(). The 'connect resolved after close' path is expressed
   * as (entry.subscriber && !entry._toreDown).
   */
  function teardownEntry(entry) {
    entry._closed = true;

    // Stop the TTL reaper regardless of which path tore the entry down.
    if (entry.ttlTimer) {
      clearTimeout(entry.ttlTimer);
      entry.ttlTimer = null;
    }

    // Real quit already initiated — do not run it again (redis@5 quit() on an
    // already-closing client rejects). This is the strict idempotency guard.
    if (entry._toreDown) return Promise.resolve();

    const subscriber = entry.subscriber;
    entry.subscriber = null;
    // No socket yet (connect still in flight): leave _toreDown false so the
    // connect .then can re-enter and release the socket once it exists.
    if (!subscriber) return Promise.resolve();

    entry._toreDown = true;

    return subscriber
      .unsubscribe(entry.channel)
      .then(function () {
        return subscriber.quit();
      })
      .catch(function (err) {
        logger.error(
          "MCP job-notifier: error closing subscriber for channel " +
            entry.channel + ": " + err.message
        );
        try {
          subscriber.destroy();
        } catch (e) {
          logger.error(
            "MCP job-notifier: error force-ending subscriber: " + e.message
          );
        }
      });
  }

  return notifier;
}

exports.createJobNotifier = createJobNotifier;
exports.MAX_SUBSCRIPTIONS = MAX_SUBSCRIPTIONS;
