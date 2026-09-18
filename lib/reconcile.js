/**
 * Startup scheduler reconciliation (#455, v2 scope).
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
 * registration on reconciliation, so every candidate hash predates this
 * restart.
 *
 * FAIL OPEN: if the scheduler snapshot cannot be taken (scheduler down,
 * command missing), active_jobs is left untouched — never mass-abort jobs on
 * a scheduler error.
 *
 * Live jobs kept across a restart are later completed via the v2 frontend's
 * checkOnly polling (init -> checkJob -> onComplete/onError), which now sets
 * TTLs (#453).
 *
 * No own Redis connection — the caller passes its client.
 */

var exec = require("child_process").exec,
  logger = require("./logger").logger,
  config = require("../config.json"),
  redisTtl = require("./redis-ttl.js");

var TERMINAL_STATUSES = { completed: true, error: true, aborted: true, cancelled: true };

// Snapshot the ids of every job currently known to the scheduler, mirroring
// lib/jobqueue.js's listing pattern. callback(err, Set) — err means the
// snapshot could not be taken and the caller must fail open.
function snapshotSchedulerIds(callback) {
  if (config.submit_type === "qsub") {
    exec("qstat", function(error, stdout, stderr) {
      if (error) {
        callback(error || new Error(stderr));
        return;
      }
      var live = new Set();
      var lines = (stdout || "").toString().split("\n");
      // qstat output: two header lines, then one job per line, id first
      for (var i = 2; i < lines.length; i++) {
        var id = lines[i].split(" ")[0].trim();
        if (id) live.add(id);
      }
      callback(null, live);
    });
  } else {
    exec("squeue --noheader --format=%i", function(error, stdout, stderr) {
      if (error) {
        callback(error || new Error(stderr));
        return;
      }
      var live = new Set();
      (stdout || "").toString().split("\n").forEach(function(line) {
        var id = line.trim();
        if (id) live.add(id);
      });
      callback(null, live);
    });
  }
}

function parseTorqueId(raw) {
  if (!raw) return null;
  try {
    var tid = JSON.parse(raw).torque_id;
    return tid === undefined || tid === null ? null : String(tid);
  } catch (e) {
    return null;
  }
}

function markZombie(client, id, torque_id) {
  client.hset(
    id,
    "status", "aborted",
    "error", JSON.stringify({ type: "script error", error: "orphaned at server restart" }),
    function(err) {
      if (err) logger.error(id + " : reconcile : redis hset failed: " + err.message);
      redisTtl.expireTerminal(client, id, torque_id);
    }
  );
}

// Sweep job hashes that are NOT in active_jobs (seen) but claim to be
// in-flight against the live scheduler snapshot.
function sweepZombieHashes(client, live, seen, callback) {
  var swept = 0;

  function scanFrom(cursor) {
    client.scan(cursor, "COUNT", "500", function(err, res) {
      if (err) {
        logger.warn("reconcile : SCAN failed, skipping zombie-hash sweep: " + err.message);
        callback(swept);
        return;
      }
      var next = res[0],
        keys = res[1] || [];
      var pending = keys.length;
      if (pending === 0) {
        proceed();
        return;
      }
      keys.forEach(function(key) {
        if (seen.has(key)) {
          if (--pending === 0) proceed();
          return;
        }
        // TYPE guard: result blobs / lists live alongside job hashes, and
        // HGETALL on a non-hash raises WRONGTYPE (prod-cleanup lesson).
        client.type(key, function(err, type) {
          if (err || type !== "hash") {
            if (--pending === 0) proceed();
            return;
          }
          client.hgetall(key, function(err, obj) {
            if (!err && obj && (obj.status === "queued" || obj.status === "running")) {
              var tid = parseTorqueId(obj.torque_id);
              // A scheduler-side hash carries datamonkey_id and is keyed by
              // the scheduler id itself.
              var liveId = tid || (obj.datamonkey_id ? key : null);
              if (!liveId || !live.has(liveId)) {
                markZombie(client, key, tid);
                swept++;
              }
            }
            if (--pending === 0) proceed();
          });
        });
      });
      function proceed() {
        if (next === "0") {
          callback(swept);
        } else {
          scanFrom(next);
        }
      }
    });
  }

  scanFrom("0");
}

function reconcileActiveJobs(client, done) {
  snapshotSchedulerIds(function(err, live) {
    if (err) {
      // FAIL OPEN: never mass-abort on a scheduler error.
      logger.warn(
        "reconcile : could not snapshot scheduler queue, leaving active_jobs untouched: " +
          err.message
      );
      done();
      return;
    }

    client.lrange("active_jobs", 0, -1, function(err, entries) {
      if (err) {
        logger.warn("reconcile : could not read active_jobs: " + err.message);
        done();
        return;
      }
      entries = entries || [];
      var unique = Array.from(new Set(entries));
      var survivors = [];
      var reaped = 0;
      var pending = unique.length;

      function finalize() {
        var ops = [["del", "active_jobs"]].concat(
          survivors.map(function(id) {
            return ["rpush", "active_jobs", id];
          })
        );
        // Atomic rebuild: each survivor exactly once, purging the historical
        // duplicate backlog.
        client.multi(ops).exec(function(err) {
          if (err) logger.error("reconcile : active_jobs rebuild failed: " + err.message);
          var seen = new Set(unique);
          sweepZombieHashes(client, live, seen, function(swept) {
            logger.warn(
              "reconcile : active_jobs entries=" + entries.length +
                " unique=" + unique.length +
                " kept=" + survivors.length +
                " reaped=" + reaped +
                " zombie hashes swept=" + swept
            );
            done();
          });
        });
      }

      if (pending === 0) {
        finalize();
        return;
      }

      unique.forEach(function(id) {
        client.hgetall(id, function(err, obj) {
          if (err || !obj) {
            // no hash — nothing to keep
            reaped++;
          } else if (TERMINAL_STATUSES[obj.status]) {
            // already terminal: drop from the list and apply the retention TTL
            var tid = parseTorqueId(obj.torque_id);
            if (obj.status === "completed") {
              redisTtl.expireCompleted(client, id, tid);
            } else {
              redisTtl.expireTerminal(client, id, tid);
            }
            reaped++;
          } else {
            var torque_id = parseTorqueId(obj.torque_id);
            if (torque_id && live.has(torque_id)) {
              survivors.push(id);
            } else {
              // unparseable or dead scheduler id -> zombie
              markZombie(client, id, torque_id);
              reaped++;
            }
          }
          if (--pending === 0) finalize();
        });
      });
    });
  });
}

exports.reconcileActiveJobs = reconcileActiveJobs;
