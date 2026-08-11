/**
 * Shared redis v5 (node-redis) client factory.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Historically every module did its own `var client = redis.createClient(...)`
 * at module scope (server.js, app/job.js, lib/jobqueue.js, app/hivtrace/*, ...).
 * redis@5 is promise-native and requires an explicit `await client.connect()`
 * after `createClient`, so the old pattern no longer works verbatim. This module
 * centralizes connection setup so every caller shares one consistent, connected
 * client and one consistent config shape.
 *
 * HOW TO USE IT (the pattern every sibling PR must follow)
 * --------------------------------------------------------
 *   const { client } = require("../lib/redis-client");
 *   // ...later, inside an async function or a .then():
 *   const obj = await client.hGetAll(job_id);   // commands are camelCased
 *   await client.hSet(job_id, "status", "done");
 *   await client.rPush("active_jobs", job_id);
 *
 * The exported `client` begins connecting the moment this module is first
 * required (mirroring the old module-scope `createClient` behaviour). Because
 * redis@5 buffers commands issued before the socket is ready, callers may issue
 * commands immediately; they resolve once the connection is established. If you
 * need to be certain the socket is up, `await client.connect()` is idempotent-ish
 * only when NOT already connecting — prefer `await ready` (also exported) which
 * resolves when the initial connect() settles.
 *
 * v5 API NOTES (vs the old v3 API this replaces)
 * ----------------------------------------------
 *   - createClient({ url } | { socket: { host, port }, password }) — no callbacks.
 *   - Commands are camelCased: hgetall->hGetAll, hset->hSet, hget->hGet,
 *     lrem->lRem, rpush->rPush, llen->lLen, del->del.
 *   - Commands return promises; there is no (err, reply) callback form.
 *
 * PUB/SUB — SUBSCRIBER DUPLICATE PATTERN (read carefully)
 * -------------------------------------------------------
 * In redis@5 a connection that is in subscriber mode CANNOT issue normal
 * commands, so a subscriber MUST be a SEPARATE connection. Use the exported
 * `createSubscriber()` helper, which does `client.duplicate()` + `connect()`.
 *
 * There is NO more `.on("message", ...)`. The listener is passed directly to
 * `.subscribe()`, and the message is the FIRST argument:
 *
 *   const sub = await createSubscriber();
 *   await sub.subscribe(channel, (message, channel) => {
 *     const packet = JSON.parse(message);
 *     // ...
 *   });
 *
 * Teardown (preserve this exactly — see leak fixes #397/#400):
 *
 *   await sub.unsubscribe(channel);
 *   await sub.quit();              // graceful; falls back to sub.destroy() on error
 *
 * `createSubscriber()` returns a promise resolving to a CONNECTED duplicate
 * client. It attaches an "error" handler so a broken subscriber socket logs
 * instead of crashing the process.
 */

const redis = require("redis"),
  logger = require("./logger").logger,
  config = require("./config");

/**
 * Build the redis@5 client options from config.json.
 * config.redis_host, config.redis_port, and optional config.redis_password.
 */
function buildClientOptions() {
  const options = {
    socket: {
      host: config.redis_host,
      port: config.redis_port,
    },
  };
  if (config.redis_password) {
    options.password = config.redis_password;
  }
  return options;
}

// Create the shared client at module scope, mirroring the historical
// `var client = redis.createClient(...)` behaviour. In redis@5 this does NOT
// open the socket by itself — connect() below does that.
const client = redis.createClient(buildClientOptions());

// Always attach an error handler so a transient redis error logs instead of
// throwing an unhandled 'error' event and crashing the process.
client.on("error", function (err) {
  logger.error("Redis client error: " + err.message);
});

// Kick off the connection immediately on load. redis@5 queues commands issued
// before the socket is ready and flushes them once connected, so callers can
// require this module and issue commands without awaiting `ready` first.
// We expose `ready` for callers that want to be sure the socket is up.
const ready = client
  .connect()
  .then(function () {
    logger.info("Redis shared client connected");
    // Apply the maxmemory guardrail as a fire-and-forget side effect — it must
    // NOT gate `ready`, or a slow/blocked CONFIG SET (managed Redis) would delay
    // every startup consumer that awaits the connection.
    applyMemoryPolicy();
  })
  .catch(function (err) {
    logger.error("Redis shared client failed to connect: " + err.message);
  });

/**
 * Transient-data retention windows (#453). Terminal job/result keys carry a TTL
 * so completed/errored/cancelled hashes (which embed the full result JSON read
 * back on WebSocket reconnect + MCP get_results) do not linger in Redis forever.
 * Completed jobs keep results long enough for a reconnecting client to fetch
 * them; terminal (error/aborted/cancelled) hashes expire sooner — nobody polls a
 * failed job. Config-overridable; defaults chosen to be generous for reconnects.
 */
// Clamp to a positive integer — a 0 or negative TTL would make client.expire
// delete the result hash immediately (breaking reconnect delivery), so fall
// back to the default rather than trust a misconfigured value.
function positiveTtl(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const COMPLETED_TTL_SECONDS = positiveTtl(config.redis_result_ttl_seconds, 86400); // 24h
const TERMINAL_TTL_SECONDS = positiveTtl(config.redis_terminal_ttl_seconds, 3600); // 1h

/**
 * Set an expiry on a COMPLETED job's keys (the result-bearing hashes). Call ONLY
 * on terminal completion — never on creation/progress writes, or an in-flight
 * job hash would vanish mid-run and break status polling/cancel. Accepts one or
 * more keys (job id + torque_id). Silently skips falsy keys. Returns a promise
 * that resolves even on error (logs, never rejects) so it is safe to fold into a
 * batched Promise.all without adding a rejection path.
 */
function expireCompleted(...keys) {
  return expireKeys(keys, COMPLETED_TTL_SECONDS);
}

/**
 * Set an expiry on a TERMINAL (error/aborted/cancelled) job's keys. Shorter
 * window than expireCompleted. Same terminal-only contract and error handling.
 */
function expireTerminal(...keys) {
  return expireKeys(keys, TERMINAL_TTL_SECONDS);
}

function expireKeys(keys, seconds) {
  const targets = keys.filter(function (k) {
    return k !== undefined && k !== null && k !== "";
  });
  if (targets.length === 0) return Promise.resolve();
  return Promise.all(
    targets.map(function (k) {
      return client.expire(k, seconds);
    })
  ).catch(function (err) {
    // A failed expire merely lets the key linger (bounded later by
    // maxmemory/volatile-ttl); it must never corrupt the terminal write path.
    logger.error("[REDIS] expire failed for [" + targets.join(", ") + "]: " + err.message);
  });
}

/**
 * Best-effort operational guardrail (#453 item 4): apply a maxmemory-policy of
 * volatile-ttl (evict only keys that HAVE a ttl — i.e. only finished result
 * blobs, never the live active_jobs list or in-flight job hashes) and, if
 * config.redis_maxmemory is set, a maxmemory budget. This is a fallback for
 * environments where we don't ship redis.conf; managed Redis (ElastiCache etc.)
 * FORBIDS CONFIG SET, so every call is wrapped and failures are logged, never
 * fatal. The canonical, declarative config still lives in deploy/redis.conf.
 */
function applyMemoryPolicy() {
  const attempts = [client.configSet("maxmemory-policy", "volatile-ttl")];
  if (config.redis_maxmemory !== undefined && config.redis_maxmemory !== "") {
    attempts.push(client.configSet("maxmemory", String(config.redis_maxmemory)));
  }
  return Promise.allSettled(attempts).then(function (results) {
    const failed = results.filter(function (r) {
      return r.status === "rejected";
    });
    if (failed.length > 0) {
      logger.warn(
        "[REDIS] CONFIG SET maxmemory policy not applied (likely a managed Redis " +
          "that forbids CONFIG SET — set it via deploy/redis.conf instead): " +
          failed[0].reason.message
      );
    } else {
      logger.info(
        "[REDIS] maxmemory-policy set to volatile-ttl" +
          (config.redis_maxmemory ? " (maxmemory=" + config.redis_maxmemory + ")" : "")
      );
    }
  });
}

/**
 * Create and connect a dedicated subscriber connection.
 *
 * redis@5 requires pub/sub to run on its own connection (a subscribed client
 * cannot run normal commands), so we duplicate the shared client's config and
 * connect the copy. Returns a promise resolving to a CONNECTED client.
 *
 * Callers own the returned client's lifetime and MUST tear it down when done:
 *   await sub.unsubscribe(channel);
 *   await sub.quit();
 * (see lib/clientsocket.js and app/hivtrace/hivtrace.js for the leak-safe
 * teardown enforced by #397/#400 and the live-PUBSUB regression tests.)
 *
 * @returns {Promise<import('redis').RedisClientType>} connected subscriber
 */
function createSubscriber() {
  const subscriber = client.duplicate();
  subscriber.on("error", function (err) {
    logger.error("Redis subscriber error: " + err.message);
  });
  return subscriber.connect().then(function () {
    return subscriber;
  });
}

module.exports = {
  client,
  ready,
  createSubscriber,
  buildClientOptions,
  expireCompleted,
  expireTerminal,
  COMPLETED_TTL_SECONDS,
  TERMINAL_TTL_SECONDS,
};
