/**
 * Transient-data retention helpers (#453, v2 backport of master's
 * lib/redis-client.js TTL layer, adapted to the redis@3 callback API).
 *
 * Terminal job/result keys carry a TTL so completed/errored/cancelled hashes
 * (which embed the full result JSON read back on WebSocket reconnect) do not
 * linger in Redis forever. Completed jobs keep results long enough for a
 * reconnecting client to fetch them; terminal (error/aborted/cancelled)
 * hashes expire sooner — nobody polls a failed job.
 *
 * v2 keeps its historical one-createClient-per-module layout, so every helper
 * takes the CALLER's client as the first argument — commands stay ordered on
 * the caller's own connection and no new Redis connections are opened here.
 */

var logger = require("./logger").logger,
  config = require("../config.json");

// Clamp to a positive number — a 0 or negative TTL would make client.expire
// delete the result hash immediately (breaking reconnect delivery), so fall
// back to the default rather than trust a misconfigured value.
function positiveTtl(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

var COMPLETED_TTL_SECONDS = positiveTtl(config.redis_result_ttl_seconds, 86400); // 24h
var TERMINAL_TTL_SECONDS = positiveTtl(config.redis_terminal_ttl_seconds, 3600); // 1h

// Apply `seconds` of TTL to every truthy key. Falsy/empty keys are skipped
// (onError can fire before torque_id exists). Errors are logged, never thrown
// — a failed expire merely lets the key linger (bounded by maxmemory/
// volatile-ttl) and must never corrupt the terminal write path.
function expireKeys(client, keys, seconds) {
  keys.forEach(function(k) {
    if (k === undefined || k === null || k === "") return;
    client.expire(k, seconds, function(err) {
      if (err) logger.error("[REDIS] expire failed for " + k + ": " + err.message);
    });
  });
}

// Set an expiry on a COMPLETED job's keys (the result-bearing hashes). Call
// ONLY on terminal completion — never on creation/progress writes, or an
// in-flight job hash would vanish mid-run and break status polling/cancel.
function expireCompleted(client) {
  expireKeys(client, Array.prototype.slice.call(arguments, 1), COMPLETED_TTL_SECONDS);
}

// Set an expiry on a TERMINAL (error/aborted/cancelled) job's keys. Shorter
// window than expireCompleted. Same terminal-only contract and error handling.
function expireTerminal(client) {
  expireKeys(client, Array.prototype.slice.call(arguments, 1), TERMINAL_TTL_SECONDS);
}

// Clear any TTL on the given keys as they (re-)enter the in-flight state.
// Persisting a TTL-less key is a harmless no-op, so this is safe to call
// unconditionally.
function persistInFlight(client) {
  Array.prototype.slice.call(arguments, 1).forEach(function(k) {
    if (k === undefined || k === null || k === "") return;
    client.persist(k, function(err) {
      if (err) logger.error("[REDIS] persist failed for " + k + ": " + err.message);
    });
  });
}

// Best-effort operational guardrail: volatile-ttl evicts only keys that HAVE
// a ttl (finished result blobs), never the live active_jobs list or in-flight
// job hashes. Managed Redis forbids CONFIG SET, so failures are warn-only.
function applyMemoryPolicy(client) {
  client.config("SET", "maxmemory-policy", "volatile-ttl", function(err) {
    if (err) {
      logger.warn("[REDIS] CONFIG SET maxmemory-policy not applied: " + err.message);
    } else {
      logger.info("[REDIS] maxmemory-policy set to volatile-ttl");
    }
  });
  if (config.redis_maxmemory !== undefined && config.redis_maxmemory !== "") {
    client.config("SET", "maxmemory", String(config.redis_maxmemory), function(err) {
      if (err) {
        logger.warn("[REDIS] CONFIG SET maxmemory not applied: " + err.message);
      } else {
        logger.info("[REDIS] maxmemory set to " + config.redis_maxmemory);
      }
    });
  }
}

exports.positiveTtl = positiveTtl;
exports.expireCompleted = expireCompleted;
exports.expireTerminal = expireTerminal;
exports.persistInFlight = persistInFlight;
exports.applyMemoryPolicy = applyMemoryPolicy;
exports.COMPLETED_TTL_SECONDS = COMPLETED_TTL_SECONDS;
exports.TERMINAL_TTL_SECONDS = TERMINAL_TTL_SECONDS;
