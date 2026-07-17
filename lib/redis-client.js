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
  config = require("../config.json");

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
  })
  .catch(function (err) {
    logger.error("Redis shared client failed to connect: " + err.message);
  });

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
};
