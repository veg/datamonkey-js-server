// #455 startup reconciliation — zombie SCAN sweep tests. test/reconcile.js
// only exercises the active_jobs LIST pass; this file covers the trailing
// SCAN sweep over job hashes that are NOT in active_jobs (the pre-fix
// restart legacy: `del active_jobs` left the hashes behind, TTL-less).
//
// Run against a live, ISOLATED redis instance (config.json) — never against
// a production instance. This suite additionally SELECTs redis db 9 so its
// flushdb/seeding cannot collide with the other suites (which use db 0).
//
// No real scheduler jobs are submitted: the scheduler snapshot is taken from
// a PATH-shim `squeue` executable that prints a fixed set of "live" ids, so
// the sweep's live/dead decisions are fully deterministic.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  logger = require("../lib/logger.js").logger,
  redisTtl = require("../lib/redis-ttl.js"),
  reconcile = require("../lib/reconcile.js");

// Dedicated db index: the sweep SCANs the entire selected db, so isolation
// keeps the swept/reaped counters in the summary line deterministic.
var client = redis.createClient({
  host: config.redis_host, port: config.redis_port, db: 9
});

describe("reconcile zombie-hash SCAN sweep (#455)", function() {
  this.timeout(30000);

  var suffix = Date.now();

  // Sweep candidates (deliberately NOT pushed onto active_jobs):
  var sweptRunning = "test-sweep-" + suffix + "-dead-running";
  var sweptQueued = "test-sweep-" + suffix + "-dead-queued";
  var sweptGarbageTid = "test-sweep-" + suffix + "-garbage-tid";
  var untouchedLive = "test-sweep-" + suffix + "-live-running";
  var schedDead = "test-sweep-" + suffix + "-sched-dead";
  var schedLive = "test-sweep-" + suffix + "-sched-live";
  var stringKey = "test-sweep-" + suffix + "-string";
  var listKey = "test-sweep-" + suffix + "-list";
  var terminalCompleted = "test-sweep-" + suffix + "-terminal-completed";
  var terminalAborted = "test-sweep-" + suffix + "-terminal-aborted";
  // The one active_jobs entry — handled by the list pass, must be skipped
  // (seen set) by the sweep even though its scheduler job is dead:
  var seenZombie = "test-sweep-" + suffix + "-seen-zombie";

  // Fake scheduler ids the PATH-shim squeue reports as live:
  var liveTid = "424242";

  var shimDir = null;
  var savedPath = process.env.PATH;
  var warnLines = [];
  var summaryLine = null;
  // Command spies, installed only for the reconcile call: which keys the
  // pass HGETALLed / TYPEd. These pin the sweep's *mechanism* (a guarded key
  // is never inspected), not just the surviving-state outcome — the outcome
  // alone is reachable even with the guards deleted, because the sweep
  // swallows WRONGTYPE errors and the list pass zombifies seenZombie before
  // the sweep reads it (same pipelined connection).
  var hgetallKeys = [];
  var typedKeys = [];

  // The terminal EXPIRE is fire-and-forget from markZombie's hset reply
  // callback, so it can land after reconcile's done(). Poll for it with a
  // deadline instead of a fixed sleep; on deadline just proceed and let the
  // individual tests report what is missing.
  function waitForTerminalTtls(keys, deadline, done) {
    var pending = keys.length;
    var allSet = true;
    keys.forEach(function(key) {
      client.ttl(key, function(err, ttl) {
        if (err || !(ttl > 0)) allSet = false;
        if (--pending === 0) {
          if (allSet || Date.now() > deadline) {
            done();
          } else {
            setTimeout(function() {
              waitForTerminalTtls(keys, deadline, done);
            }, 25);
          }
        }
      });
    });
  }

  before(function(done) {
    // Any non-qsub submit_type routes reconcile to the squeue branch (prod
    // v2 uses "slurm"); the qstat branch is out of scope here.
    if (config.submit_type === "qsub") {
      this.skip();
      return;
    }

    // PATH-shim squeue: prints one "live" id per line — a numeric torque id
    // plus the scheduler-side hash key itself (behavior 3's live case).
    shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "sweep-shim-"));
    fs.writeFileSync(
      path.join(shimDir, "squeue"),
      "#!/bin/sh\necho " + liveTid + "\necho " + schedLive + "\n",
      { mode: 493 } // 0755
    );
    process.env.PATH = shimDir + ":" + savedPath;

    client.multi([
      // db 9 is exclusively ours — start from a clean slate so the SCAN
      // sweep sees exactly the keys seeded below.
      ["flushdb"],
      ["rpush", "active_jobs", seenZombie],
      // 1. in-flight hashes not in active_jobs, scheduler job gone -> swept
      ["hset", sweptRunning, "status", "running",
        "torque_id", JSON.stringify({ torque_id: "999999901" })],
      ["hset", sweptQueued, "status", "queued",
        "torque_id", JSON.stringify({ torque_id: "999999902" })],
      // adjacent edge: unparseable torque_id, no datamonkey_id -> no live id
      // to check -> swept
      ["hset", sweptGarbageTid, "status", "running",
        "torque_id", "not json at all"],
      // 2. in-flight, not in active_jobs, but scheduler job still live
      ["hset", untouchedLive, "status", "running",
        "torque_id", JSON.stringify({ torque_id: liveTid })],
      // 3. scheduler-side hashes: keyed by the scheduler id itself, carry
      // datamonkey_id, no parseable torque_id
      ["hset", schedDead, "status", "running", "datamonkey_id", "dm-" + suffix],
      ["hset", schedLive, "status", "running", "datamonkey_id", "dm-" + suffix],
      // 4. non-hash keys living alongside job hashes (TYPE guard)
      ["set", stringKey, "just a result blob"],
      ["rpush", listKey, "a", "b"],
      // 5. terminal hashes not in active_jobs -> not sweep candidates
      ["hset", terminalCompleted, "status", "completed",
        "torque_id", JSON.stringify({ torque_id: "999999903" })],
      ["hset", terminalAborted, "status", "aborted",
        "torque_id", JSON.stringify({ torque_id: "999999904" })],
      // 6. the seen entry: dead scheduler job, zombified by the LIST pass
      ["hset", seenZombie, "status", "queued",
        "torque_id", JSON.stringify({ torque_id: "999999905" })]
    ]).exec(function(err) {
      should.not.exist(err);
      // Capture the reconcile summary so the swept counter (which only the
      // SCAN sweep increments) is observable.
      var realWarn = logger.warn.bind(logger);
      logger.warn = function(msg) {
        warnLines.push(String(msg));
        return realWarn.apply(null, arguments);
      };
      // Record every key reconcile inspects. The sweep always TYPEs a
      // candidate before HGETALL; the list pass HGETALLs without TYPE.
      var realHgetall = client.hgetall;
      var realType = client.type;
      client.hgetall = function(key) {
        hgetallKeys.push(key);
        return realHgetall.apply(client, arguments);
      };
      client.type = function(key) {
        typedKeys.push(key);
        return realType.apply(client, arguments);
      };
      reconcile.reconcileActiveJobs(client, function() {
        logger.warn = realWarn;
        client.hgetall = realHgetall;
        client.type = realType;
        warnLines.forEach(function(line) {
          if (line.indexOf("zombie hashes swept=") !== -1) summaryLine = line;
        });
        // wait (deterministically) for the fire-and-forget terminal EXPIREs
        waitForTerminalTtls(
          [sweptRunning, sweptQueued, sweptGarbageTid, schedDead, seenZombie],
          Date.now() + 5000,
          done
        );
      });
    });
  });

  after(function(done) {
    process.env.PATH = savedPath;
    if (shimDir) {
      try {
        fs.unlinkSync(path.join(shimDir, "squeue"));
        fs.rmdirSync(shimDir);
      } catch (e) { /* best effort */ }
    }
    // No real scheduler jobs were submitted, so nothing to scancel.
    // db 9 is exclusively this suite's — drop every seeded/created key.
    client.flushdb(function() {
      client.quit();
      done();
    });
  });

  function shouldBeZombified(id, done) {
    client.hgetall(id, function(err, obj) {
      should.not.exist(err);
      should.exist(obj);
      obj.status.should.equal("aborted");
      var parsed = JSON.parse(obj.error);
      parsed.type.should.equal("script error");
      parsed.error.should.equal("orphaned at server restart");
      client.ttl(id, function(err, ttl) {
        should.not.exist(err);
        ttl.should.be.above(0);
        ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
        done();
      });
    });
  }

  function shouldBeUntouchedInFlight(id, expectedStatus, done) {
    client.hgetall(id, function(err, obj) {
      should.not.exist(err);
      should.exist(obj);
      obj.status.should.equal(expectedStatus);
      should.not.exist(obj.error);
      client.ttl(id, function(err, ttl) {
        should.not.exist(err);
        ttl.should.equal(-1);
        done();
      });
    });
  }

  // --- 1. dead in-flight hashes outside active_jobs are swept ---

  it("sweeps a running hash whose scheduler job is gone: aborted + orphan error + terminal ttl", function(done) {
    shouldBeZombified(sweptRunning, done);
  });

  it("sweeps a queued hash whose scheduler job is gone", function(done) {
    shouldBeZombified(sweptQueued, done);
  });

  it("sweeps an in-flight hash with an unparseable torque_id and no datamonkey_id", function(done) {
    shouldBeZombified(sweptGarbageTid, done);
  });

  // --- 2. live in-flight hash outside active_jobs is left alone ---
  // Negative test: always green under a full sweep revert; it guards against
  // OVER-sweeping and is only meaningful paired with the positive tests above.

  it("leaves a running hash untouched when its torque_id is in the scheduler snapshot", function(done) {
    shouldBeUntouchedInFlight(untouchedLive, "running", done);
  });

  // --- 3. scheduler-side hashes keyed by the scheduler id itself ---

  it("zombifies a scheduler-side hash (datamonkey_id, no torque_id) whose own key is absent from the snapshot", function(done) {
    shouldBeZombified(schedDead, done);
  });

  // Negative test (over-sweeping guard): green under a sweep revert, paired
  // with the schedDead positive above.
  it("leaves a scheduler-side hash untouched when its own key is in the snapshot", function(done) {
    client.hgetall(schedLive, function(err, obj) {
      should.not.exist(err);
      obj.status.should.equal("running");
      obj.datamonkey_id.should.equal("dm-" + suffix);
      should.not.exist(obj.error);
      client.ttl(schedLive, function(err, ttl) {
        should.not.exist(err);
        ttl.should.equal(-1);
        done();
      });
    });
  });

  // --- 4. TYPE guard: non-hash keys survive and the sweep still completes ---
  // The two survival tests are negative tests: they stay green even with the
  // TYPE guard deleted, because the sweep swallows the WRONGTYPE reply
  // (`if (!err && obj && ...)`) and the keys survive either way. They guard
  // against over-sweeping only; the guard *mechanism* is pinned by the spy
  // test below, which fails if HGETALL is ever issued on a non-hash key.

  it("leaves a plain string key untouched with no WRONGTYPE failure", function(done) {
    client.get(stringKey, function(err, value) {
      should.not.exist(err);
      value.should.equal("just a result blob");
      client.ttl(stringKey, function(err, ttl) {
        should.not.exist(err);
        ttl.should.equal(-1);
        done();
      });
    });
  });

  it("leaves a list key untouched with no WRONGTYPE failure", function(done) {
    client.lrange(listKey, 0, -1, function(err, entries) {
      should.not.exist(err);
      entries.should.deepEqual(["a", "b"]);
      client.ttl(listKey, function(err, ttl) {
        should.not.exist(err);
        ttl.should.equal(-1);
        done();
      });
    });
  });

  it("completes the sweep and reports done despite the non-hash keys", function() {
    // done() already fired (we are past before()) — and the summary line was
    // emitted, proving the sweep did not stall on a WRONGTYPE reply.
    should.exist(summaryLine);
  });

  it("never issues HGETALL on the non-hash keys (TYPE-guard mechanism)", function() {
    // The sweep visited both keys (TYPE probe recorded) but the guard kept
    // HGETALL from ever being issued. Without the guard, HGETALL fires and
    // its WRONGTYPE error is silently swallowed — invisible to the survival
    // tests above, but caught here.
    typedKeys.should.containEql(stringKey);
    typedKeys.should.containEql(listKey);
    hgetallKeys.should.not.containEql(stringKey);
    hgetallKeys.should.not.containEql(listKey);
  });

  // --- 5. terminal hashes outside active_jobs are not sweep candidates ---
  // Negative tests: always green under a full sweep revert; they guard
  // against over-sweeping (terminal hashes gaining errors/TTLs), paired with
  // the behavior-1 positives that catch under-sweeping.

  it("does not touch a completed hash outside active_jobs (no ttl added by the sweep)", function(done) {
    client.hgetall(terminalCompleted, function(err, obj) {
      should.not.exist(err);
      obj.status.should.equal("completed");
      should.not.exist(obj.error);
      client.ttl(terminalCompleted, function(err, ttl) {
        should.not.exist(err);
        ttl.should.equal(-1);
        done();
      });
    });
  });

  it("does not touch an already-aborted hash outside active_jobs", function(done) {
    client.hgetall(terminalAborted, function(err, obj) {
      should.not.exist(err);
      obj.status.should.equal("aborted");
      should.not.exist(obj.error);
      client.ttl(terminalAborted, function(err, ttl) {
        should.not.exist(err);
        ttl.should.equal(-1);
        done();
      });
    });
  });

  // --- 6. active_jobs entries (the seen set) are skipped by the sweep ---

  it("handles the active_jobs zombie via the list pass, not the sweep", function(done) {
    // Sanity: the list pass did zombify it (and dropped it from the list).
    client.hget(seenZombie, "status", function(err, status) {
      should.not.exist(err);
      status.should.equal("aborted");
      client.lrange("active_jobs", 0, -1, function(err, entries) {
        should.not.exist(err);
        (entries || []).should.deepEqual([]);
        done();
      });
    });
  });

  it("the sweep never inspects the seen entry (seen-set mechanism)", function() {
    // Outcome checks alone cannot pin the seen-set guard: the list pass's
    // zombifying hset lands on the same pipelined connection before the
    // sweep's read, so with the guard deleted, seenZombie is already
    // 'aborted' when the sweep reaches it and every state assertion still
    // passes. Instead, pin the mechanism: the sweep always TYPEs a candidate
    // before HGETALL, and the list pass never calls TYPE — so any TYPE probe
    // on seenZombie can only mean the sweep ignored the seen set.
    typedKeys.should.not.containEql(seenZombie);
    // And the single recorded HGETALL is the list pass's; a second would be
    // the sweep's.
    hgetallKeys
      .filter(function(key) { return key === seenZombie; })
      .length.should.equal(1);
  });

  it("counts exactly the four non-list zombies as swept — the seen entry is not double-counted", function() {
    // Outcome check (the counter): the swept counter is incremented ONLY
    // inside the SCAN sweep. In a clean db 9 the candidates are
    // sweptRunning, sweptQueued, sweptGarbageTid and schedDead — four.
    // seenZombie's scheduler job is just as dead, but it was reaped by the
    // list pass; the mechanism test above pins that the sweep skipped it.
    should.exist(summaryLine);
    summaryLine.should.match(/zombie hashes swept=4(\s|$)/);
    // And the list pass reaped exactly the one active_jobs entry.
    summaryLine.should.match(/ reaped=1 /);
    summaryLine.should.match(/ kept=0 /);
  });
});
