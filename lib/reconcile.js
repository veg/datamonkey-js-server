/**
 * Startup scheduler reconciliation (#455) — v3 port of the v2 module
 * (PR #462); redis@5 promise API; local submit_type resolves an empty
 * snapshot; no own Redis connection — the caller passes its client.
 *
 * Historically server.js blindly ran `client.del("active_jobs")` on boot,
 * orphaning every job that was still live on the scheduler and leaving their
 * (TTL-less) hashes behind forever. Instead, reconcile the active_jobs list
 * against a single scheduler snapshot taken at startup:
 *
 *   - entries whose scheduler job is still live are KEPT (deduped, exactly
 *     once — purging the historical duplicate-push backlog);
 *   - entries already in a terminal state are dropped and their hashes get
 *     the appropriate retention TTL (#453);
 *   - entries whose scheduler job no longer exists are zombies: marked
 *     aborted, given the terminal TTL, and dropped.
 *
 * A final SCAN sweep applies the same treatment to queued/running job hashes
 * that are not in active_jobs at all (pre-fix restarts deleted the list but
 * not the hashes). This is sound because server.js gates socket handler
 * registration AND the MCP server on reconciliation, so every candidate hash
 * predates this restart.
 *
 * FAIL OPEN: if the scheduler snapshot cannot be taken (scheduler down,
 * command missing), active_jobs is left untouched — never mass-abort jobs on
 * a scheduler error.
 */

const { exec } = require("child_process");
const util = require("util");
const execP = util.promisify(exec);
const logger = require("./logger").logger;
const config = require("./config");
// TTL constants only — the redis-client expire helpers are bound to the
// shared client, and this module must operate on whichever client the caller
// passes (tests use isolated connections/databases).
const {
  COMPLETED_TTL_SECONDS,
  TERMINAL_TTL_SECONDS,
} = require("./redis-client");

const TERMINAL_STATUSES = new Set([
  "completed",
  "error",
  "aborted",
  "cancelled",
]);
const SNAPSHOT_TIMEOUT_MS = 15000;

/**
 * Snapshot the ids of every job currently known to the scheduler, mirroring
 * lib/jobqueue.js's listing pattern. Reads config.submit_type AT CALL TIME.
 * Resolves a Set of live scheduler ids; any exec error (including the
 * timeout kill) THROWS to the caller, which must fail open.
 */
async function snapshotSchedulerIds() {
  if (config.submit_type === "local") {
    // A restart severs self.local_process and the watcher; local in-flight
    // jobs are unfinalizable, so an empty snapshot (zombie-marking) is
    // correct — and it avoids exec'ing squeue on local-only boxes.
    return new Set();
  }
  if (config.submit_type === "qsub") {
    const { stdout } = await execP("qstat", { timeout: SNAPSHOT_TIMEOUT_MS });
    const live = new Set();
    const lines = (stdout || "").toString().split("\n");
    // qstat output: two header lines, then one job per line, id first
    for (let i = 2; i < lines.length; i++) {
      const id = lines[i].split(" ")[0].trim();
      if (id) live.add(id);
    }
    return live;
  }
  const { stdout } = await execP("squeue --noheader --format=%i", {
    timeout: SNAPSHOT_TIMEOUT_MS,
  });
  const live = new Set();
  (stdout || "")
    .toString()
    .split("\n")
    .forEach(function (line) {
      const id = line.trim();
      if (id) live.add(id);
    });
  return live;
}

function parseTorqueId(raw) {
  if (!raw) return null;
  try {
    const tid = JSON.parse(raw).torque_id;
    return tid === undefined || tid === null ? null : String(tid);
  } catch (e) {
    return null;
  }
}

// Mirror of redis-client.js's expireKeys, but on the injected client. Skips
// falsy keys, logs on failure, never rejects.
async function expireKeys(client, keys, seconds) {
  const targets = keys.filter(function (k) {
    return k !== undefined && k !== null && k !== "";
  });
  if (targets.length === 0) return;
  await Promise.all(
    targets.map(function (k) {
      return client.expire(k, seconds);
    })
  ).catch(function (err) {
    logger.error(
      "reconcile : expire failed for [" +
        targets.join(", ") +
        "]: " +
        err.message
    );
  });
}

// Mark an orphaned in-flight hash aborted and apply the terminal retention
// TTL. The hSet is awaited BEFORE the expire (the v2 module fired both from
// a callback; awaiting removes that fire-and-forget race).
async function markZombie(client, id, torque_id) {
  await client
    .hSet(id, {
      status: "aborted",
      error: JSON.stringify({
        type: "script error",
        error: "orphaned at server restart",
      }),
    })
    .catch(function (err) {
      logger.error(id + " : reconcile : redis hSet failed: " + err.message);
    });
  await expireKeys(client, [id, torque_id], TERMINAL_TTL_SECONDS);
}

// Sweep job hashes that are NOT in active_jobs (seen) but claim to be
// in-flight against the live scheduler snapshot. Resolves the swept count;
// never rejects (a SCAN failure logs and returns the partial count — the
// sweep must never block boot).
async function sweepZombieHashes(client, live, seen) {
  let swept = 0;
  try {
    // node-redis v5 scanIterator yields ARRAYS of keys per batch, not
    // single keys.
    for await (const keys of client.scanIterator({ COUNT: 500 })) {
      for (const key of keys) {
        if (seen.has(key)) continue;
        // TYPE guard: result blobs / lists live alongside job hashes, and
        // HGETALL on a non-hash raises WRONGTYPE (prod-cleanup lesson).
        if ((await client.type(key)) !== "hash") continue;
        // redis@5 resolves {} for a missing key — guard on emptiness.
        const obj = await client.hGetAll(key);
        if (Object.keys(obj).length === 0) continue;
        if (obj.status === "queued" || obj.status === "running") {
          const tid = parseTorqueId(obj.torque_id);
          // A scheduler-side hash carries datamonkey_id and is keyed by the
          // scheduler id itself.
          const liveId = tid || (obj.datamonkey_id ? key : null);
          if (!liveId || !live.has(liveId)) {
            await markZombie(client, key, tid);
            swept++;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(
      "reconcile : SCAN failed, skipping zombie-hash sweep: " + err.message
    );
  }
  return swept;
}

/**
 * Reconcile the active_jobs list (and orphaned in-flight hashes) against a
 * single scheduler snapshot. CONTRACT: NEVER rejects — server.js gates
 * socket/MCP registration on this promise, so any failure path must resolve.
 * Resolves a summary { entries, unique, kept, reaped, swept } for tests.
 */
async function reconcileActiveJobs(client) {
  try {
    let live;
    try {
      live = await snapshotSchedulerIds();
    } catch (err) {
      // FAIL OPEN: never mass-abort on a scheduler error.
      logger.warn(
        "reconcile : could not snapshot scheduler queue, leaving active_jobs untouched: " +
          err.message
      );
      return;
    }

    let entries;
    try {
      entries = (await client.lRange("active_jobs", 0, -1)) || [];
    } catch (err) {
      logger.warn("reconcile : could not read active_jobs: " + err.message);
      return;
    }

    const unique = Array.from(new Set(entries));
    const survivors = [];
    let reaped = 0;

    for (const id of unique) {
      const obj = await client.hGetAll(id);
      if (Object.keys(obj).length === 0) {
        // no hash — nothing to keep
        reaped++;
      } else if (TERMINAL_STATUSES.has(obj.status)) {
        // already terminal: drop from the list and apply the retention TTL
        await expireKeys(
          client,
          [id, parseTorqueId(obj.torque_id)],
          obj.status === "completed"
            ? COMPLETED_TTL_SECONDS
            : TERMINAL_TTL_SECONDS
        );
        reaped++;
      } else {
        const tid = parseTorqueId(obj.torque_id);
        if (tid && live.has(tid)) {
          survivors.push(id);
          // Defensive #453 invariant pin: an in-flight survivor must be
          // TTL-less. PERSIST is a no-op when no TTL is set; it guards the
          // resurrect-same-id trap (a TTL'd terminal hash reused in flight).
          await client.persist(id).catch(function (err) {
            logger.error(
              id + " : reconcile : redis persist failed: " + err.message
            );
          });
          if (tid !== id) {
            await client.persist(tid).catch(function (err) {
              logger.error(
                tid + " : reconcile : redis persist failed: " + err.message
              );
            });
          }
        } else {
          // unparseable or dead scheduler id -> zombie
          await markZombie(client, id, tid);
          reaped++;
        }
      }
    }

    // Atomic rebuild: each survivor exactly once, purging the historical
    // duplicate backlog.
    try {
      const m = client.multi().del("active_jobs");
      survivors.forEach(function (id) {
        m.rPush("active_jobs", id);
      });
      await m.exec();
    } catch (err) {
      logger.error("reconcile : active_jobs rebuild failed: " + err.message);
    }

    const swept = await sweepZombieHashes(client, live, new Set(unique));

    logger.warn(
      "reconcile : active_jobs entries=" +
        entries.length +
        " unique=" +
        unique.length +
        " kept=" +
        survivors.length +
        " reaped=" +
        reaped +
        " zombie hashes swept=" +
        swept
    );

    return {
      entries: entries.length,
      unique: unique.length,
      kept: survivors.length,
      reaped: reaped,
      swept: swept,
    };
  } catch (err) {
    // Belt-and-braces: the boot gate depends on this promise resolving.
    logger.error("reconcile : unexpected error: " + err.message);
  }
}

exports.reconcileActiveJobs = reconcileActiveJobs;
