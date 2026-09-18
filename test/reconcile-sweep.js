// #455 startup reconciliation — zombie SCAN sweep tests (v3 port of the v2
// suite from PR #462). test/reconcile.js only exercises the active_jobs LIST
// pass; this file covers the trailing SCAN sweep over job hashes that are
// NOT in active_jobs (the pre-fix restart legacy: `del active_jobs` left the
// hashes behind, TTL-less).
//
// Run against a live, ISOLATED redis instance (config.json) — never against
// a production instance. This suite additionally uses redis db 9 so its
// flushDb/seeding cannot collide with the other suites (which use db 0) —
// which works precisely because reconcile only ever touches the client the
// caller passes in.
//
// No real scheduler jobs are submitted: the scheduler snapshot is taken from
// a PATH-shim `squeue` executable that prints a fixed set of "live" ids, so
// the sweep's live/dead decisions are fully deterministic.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../lib/config"),
  logger = require("../lib/logger.js").logger,
  redisClient = require("../lib/redis-client"),
  reconcile = require("../lib/reconcile.js");

// Dedicated db index: the sweep SCANs the entire selected db, so isolation
// keeps the swept/reaped counters in the summary line deterministic.
var client = redis.createClient(
  Object.assign({}, redisClient.buildClientOptions(), { database: 9 })
);

describe("reconcile zombie-hash SCAN sweep (#455)", function () {
  this.timeout(60000);

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
  // Filler string keys (> one SCAN batch at COUNT 500) so scanIterator's
  // batch-array semantics are actually exercised across multiple batches.
  var BULK_KEYS = 600;

  // Fake scheduler ids the PATH-shim squeue reports as live:
  var liveTid = "424242";

  var shimDir = null;
  var savedPath = process.env.PATH;
  var origSubmitType = config.submit_type;
  var warnLines = [];
  var summaryLine = null;
  // Command spies, installed only for the reconcile call: which keys the
  // pass HGETALLed / TYPEd. These pin the sweep's *mechanism* (a guarded key
  // is never inspected), not just the surviving-state outcome — the outcome
  // alone is reachable even with the guards deleted, because the sweep
  // swallows errors and the list pass zombifies seenZombie before the sweep
  // reads it (same connection, sequential awaits).
  var hgetallKeys = [];
  var typedKeys = [];

  before(async function () {
    // PATH-shim squeue: prints one "live" id per line — a numeric torque id
    // plus the scheduler-side hash key itself (behavior 3's live case).
    shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "sweep-shim-"));
    fs.writeFileSync(
      path.join(shimDir, "squeue"),
      "#!/bin/sh\necho " + liveTid + "\necho " + schedLive + "\n",
      { mode: 493 } // 0755
    );
    process.env.PATH = shimDir + ":" + savedPath;
    // Route reconcile down the squeue branch regardless of the local/CI
    // config; restored in after() — test:ci shares one mocha process.
    config.submit_type = "slurm";

    await client.connect();
    // db 9 is exclusively ours — start from a clean slate so the SCAN sweep
    // sees exactly the keys seeded below.
    await client.flushDb();
    var m = client
      .multi()
      .rPush("active_jobs", seenZombie)
      // 1. in-flight hashes not in active_jobs, scheduler job gone -> swept
      .hSet(sweptRunning, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "999999901" }),
      })
      .hSet(sweptQueued, {
        status: "queued",
        torque_id: JSON.stringify({ torque_id: "999999902" }),
      })
      // adjacent edge: unparseable torque_id, no datamonkey_id -> no live id
      // to check -> swept
      .hSet(sweptGarbageTid, {
        status: "running",
        torque_id: "not json at all",
      })
      // 2. in-flight, not in active_jobs, but scheduler job still live
      .hSet(untouchedLive, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: liveTid }),
      })
      // 3. scheduler-side hashes: keyed by the scheduler id itself, carry
      // datamonkey_id, no parseable torque_id
      .hSet(schedDead, { status: "running", datamonkey_id: "dm-" + suffix })
      .hSet(schedLive, { status: "running", datamonkey_id: "dm-" + suffix })
      // 4. non-hash keys living alongside job hashes (TYPE guard)
      .set(stringKey, "just a result blob")
      .rPush(listKey, ["a", "b"])
      // 5. terminal hashes not in active_jobs -> not sweep candidates
      .hSet(terminalCompleted, {
        status: "completed",
        torque_id: JSON.stringify({ torque_id: "999999903" }),
      })
      .hSet(terminalAborted, {
        status: "aborted",
        torque_id: JSON.stringify({ torque_id: "999999904" }),
      })
      // 6. the seen entry: dead scheduler job, zombified by the LIST pass
      .hSet(seenZombie, {
        status: "queued",
        torque_id: JSON.stringify({ torque_id: "999999905" }),
      });
    // 7. bulk filler so the SCAN spans multiple COUNT-500 batches
    for (var i = 0; i < BULK_KEYS; i++) {
      m.set("test-sweep-" + suffix + "-bulk-" + i, "x");
    }
    await m.exec();

    // Capture the reconcile summary so the swept counter (which only the
    // SCAN sweep increments) is observable.
    var realWarn = logger.warn.bind(logger);
    var patchedWarn = function (msg) {
      warnLines.push(String(msg));
      return realWarn.apply(null, arguments);
    };
    logger.warn = patchedWarn;
    // Record every key reconcile inspects. The sweep always TYPEs a
    // candidate before HGETALL; the list pass HGETALLs without TYPE.
    var realHgetall = client.hGetAll;
    var realType = client.type;
    client.hGetAll = function (key) {
      hgetallKeys.push(key);
      return realHgetall.apply(client, arguments);
    };
    client.type = function (key) {
      typedKeys.push(key);
      return realType.apply(client, arguments);
    };
    try {
      // markZombie awaits its hSet + expire, so every terminal TTL has
      // landed by the time this resolves — no v2-style polling needed.
      await reconcile.reconcileActiveJobs(client);
    } finally {
      logger.warn = realWarn;
      client.hGetAll = realHgetall;
      client.type = realType;
    }
    warnLines.forEach(function (line) {
      if (line.indexOf("zombie hashes swept=") !== -1) summaryLine = line;
    });
  });

  after(async function () {
    process.env.PATH = savedPath;
    config.submit_type = origSubmitType;
    if (shimDir) {
      fs.rmSync(shimDir, { recursive: true, force: true });
    }
    // No real scheduler jobs were submitted, so nothing to scancel.
    // db 9 is exclusively this suite's — drop every seeded/created key.
    if (client.isOpen) {
      await client.flushDb();
      client.destroy();
    }
  });

  async function shouldBeZombified(id) {
    var obj = await client.hGetAll(id);
    obj.status.should.equal("aborted");
    var parsed = JSON.parse(obj.error);
    parsed.type.should.equal("script error");
    parsed.error.should.equal("orphaned at server restart");
    var ttl = await client.ttl(id);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.TERMINAL_TTL_SECONDS);
  }

  async function shouldBeUntouchedInFlight(id, expectedStatus) {
    var obj = await client.hGetAll(id);
    obj.status.should.equal(expectedStatus);
    should.not.exist(obj.error);
    (await client.ttl(id)).should.equal(-1);
  }

  // --- 1. dead in-flight hashes outside active_jobs are swept ---

  it("sweeps a running hash whose scheduler job is gone: aborted + orphan error + terminal ttl", async function () {
    await shouldBeZombified(sweptRunning);
  });

  it("sweeps a queued hash whose scheduler job is gone", async function () {
    await shouldBeZombified(sweptQueued);
  });

  it("sweeps an in-flight hash with an unparseable torque_id and no datamonkey_id", async function () {
    await shouldBeZombified(sweptGarbageTid);
  });

  // --- 2. live in-flight hash outside active_jobs is left alone ---
  // Negative test: always green under a full sweep revert; it guards against
  // OVER-sweeping and is only meaningful paired with the positive tests above.

  it("leaves a running hash untouched when its torque_id is in the scheduler snapshot", async function () {
    await shouldBeUntouchedInFlight(untouchedLive, "running");
  });

  // --- 3. scheduler-side hashes keyed by the scheduler id itself ---

  it("zombifies a scheduler-side hash (datamonkey_id, no torque_id) whose own key is absent from the snapshot", async function () {
    await shouldBeZombified(schedDead);
  });

  // Negative test (over-sweeping guard): green under a sweep revert, paired
  // with the schedDead positive above.
  it("leaves a scheduler-side hash untouched when its own key is in the snapshot", async function () {
    var obj = await client.hGetAll(schedLive);
    obj.status.should.equal("running");
    obj.datamonkey_id.should.equal("dm-" + suffix);
    should.not.exist(obj.error);
    (await client.ttl(schedLive)).should.equal(-1);
  });

  // --- 4. TYPE guard: non-hash keys survive and the sweep still completes ---
  // The two survival tests are negative tests: they stay green even with the
  // TYPE guard deleted, because a WRONGTYPE reply only fails that key's read
  // inside the sweep's try/catch and the keys survive either way. They guard
  // against over-sweeping only; the guard *mechanism* is pinned by the spy
  // test below, which fails if HGETALL is ever issued on a non-hash key.

  it("leaves a plain string key untouched with no WRONGTYPE failure", async function () {
    (await client.get(stringKey)).should.equal("just a result blob");
    (await client.ttl(stringKey)).should.equal(-1);
  });

  it("leaves a list key untouched with no WRONGTYPE failure", async function () {
    (await client.lRange(listKey, 0, -1)).should.deepEqual(["a", "b"]);
    (await client.ttl(listKey)).should.equal(-1);
  });

  it("completes the sweep and reports the summary despite the non-hash keys", function () {
    // reconcileActiveJobs resolved (we are past before()) — and the summary
    // line was emitted, proving the sweep did not stall on a WRONGTYPE reply.
    should.exist(summaryLine);
  });

  it("never issues HGETALL on the non-hash keys (TYPE-guard mechanism)", function () {
    // The sweep visited both keys (TYPE probe recorded) but the guard kept
    // HGETALL from ever being issued. Without the guard, HGETALL fires and
    // its WRONGTYPE error aborts the batch via the sweep's catch — invisible
    // to the survival tests above, but caught here.
    typedKeys.should.containEql(stringKey);
    typedKeys.should.containEql(listKey);
    hgetallKeys.should.not.containEql(stringKey);
    hgetallKeys.should.not.containEql(listKey);
  });

  it("iterates every SCAN batch (node-redis v5 yields ARRAYS of keys per batch)", function () {
    // With 600+ filler keys the SCAN cannot fit one COUNT-500 batch. Every
    // filler is a non-seen string key, so each must show up as a TYPE probe;
    // a for-await that mistook the yielded batch array for a single key
    // would probe (or sweep) nothing recognizable and fail here.
    var bulkTyped = typedKeys.filter(function (key) {
      return String(key).indexOf("test-sweep-" + suffix + "-bulk-") === 0;
    });
    bulkTyped.length.should.equal(BULK_KEYS);
  });

  // --- 5. terminal hashes outside active_jobs are not sweep candidates ---
  // Negative tests: always green under a full sweep revert; they guard
  // against over-sweeping (terminal hashes gaining errors/TTLs), paired with
  // the behavior-1 positives that catch under-sweeping.

  it("does not touch a completed hash outside active_jobs (no ttl added by the sweep)", async function () {
    var obj = await client.hGetAll(terminalCompleted);
    obj.status.should.equal("completed");
    should.not.exist(obj.error);
    (await client.ttl(terminalCompleted)).should.equal(-1);
  });

  it("does not touch an already-aborted hash outside active_jobs", async function () {
    var obj = await client.hGetAll(terminalAborted);
    obj.status.should.equal("aborted");
    should.not.exist(obj.error);
    (await client.ttl(terminalAborted)).should.equal(-1);
  });

  // --- 6. active_jobs entries (the seen set) are skipped by the sweep ---

  it("handles the active_jobs zombie via the list pass, not the sweep", async function () {
    // Sanity: the list pass did zombify it (and dropped it from the list).
    (await client.hGet(seenZombie, "status")).should.equal("aborted");
    (await client.lRange("active_jobs", 0, -1)).should.deepEqual([]);
  });

  it("the sweep never inspects the seen entry (seen-set mechanism)", function () {
    // Outcome checks alone cannot pin the seen-set guard: the list pass's
    // zombifying hSet lands before the sweep's read (sequential awaits on
    // the same client), so with the guard deleted, seenZombie is already
    // 'aborted' when the sweep reaches it and every state assertion still
    // passes. Instead, pin the mechanism: the sweep always TYPEs a candidate
    // before HGETALL, and the list pass never calls TYPE — so any TYPE probe
    // on seenZombie can only mean the sweep ignored the seen set.
    typedKeys.should.not.containEql(seenZombie);
    // And the single recorded HGETALL is the list pass's; a second would be
    // the sweep's.
    hgetallKeys
      .filter(function (key) {
        return key === seenZombie;
      })
      .length.should.equal(1);
  });

  it("counts exactly the four non-list zombies as swept — the seen entry is not double-counted", function () {
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
