// #455 startup-reconciliation edge cases (v3 port of the v2 suite from PR
// #462). Complements test/reconcile.js (happy path against a real SLURM job)
// with the fail-open path, the resolve contract, zombie/reap edges, the
// atomic dedup rebuild, the qsub parsing branch, and two v3-only cases (the
// "local" submit_type snapshot and the 15s snapshot exec timeout) — all
// against PATH-shim scheduler binaries so no real jobs are ever submitted,
// and a live, ISOLATED redis instance (config.json) — never a production
// instance.
//
// server.js gates registerHandlers() (socket routes + the MCP server) on the
// reconcileActiveJobs promise; the "resolves on every path" assertions here
// are what that gate depends on — any rejection would fail these awaits.
//
// config.submit_type is mutated per-case on the require-cached lib/config
// export and ALWAYS restored (before/afterEach/after): test:ci runs every
// suite in one mocha process, so a leaked mutation would poison later suites.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../lib/config"),
  redisClient = require("../lib/redis-client"),
  reconcile = require("../lib/reconcile.js");

var client = redis.createClient(redisClient.buildClientOptions());

describe("startup reconciliation edge cases (#455)", function () {
  this.timeout(60000);

  var suffix = Date.now();
  var seeded = [];
  var origPath = process.env.PATH;
  var origSubmitType = config.submit_type;

  var shimBase = path.join(os.tmpdir(), "reconcile455-shims-" + process.pid);
  var failDir = path.join(shimBase, "fail");
  var liveDir = path.join(shimBase, "live");
  var qsubDir = path.join(shimBase, "qsub");
  var hangDir = path.join(shimBase, "hang");

  function writeShim(dir, name, body) {
    var p = path.join(dir, name);
    fs.writeFileSync(p, "#!/bin/sh\n" + body + "\n");
    fs.chmodSync(p, 493 /* 0755 */);
  }

  // Shim squeue that reports exactly `ids` as the live scheduler snapshot.
  function liveSqueue(ids) {
    writeShim(
      liveDir,
      "squeue",
      ids
        .map(function (i) {
          return "echo " + i;
        })
        .join("\n") || "true"
    );
    process.env.PATH = liveDir + ":" + origPath;
  }

  function track(id) {
    seeded.push(id);
    return id;
  }

  before(async function () {
    [failDir, liveDir, qsubDir, hangDir].forEach(function (d) {
      fs.mkdirSync(d, { recursive: true });
    });
    // scheduler snapshot unavailable: nonzero exit from both listers
    writeShim(failDir, "squeue", "exit 2");
    writeShim(failDir, "qstat", "exit 2");
    // scheduler lister that never answers (drives the 15s exec timeout)
    writeShim(hangDir, "squeue", "sleep 60");
    // qstat output shape: two header lines, then one job per row, id first
    // (printf '%s\n' so the all-dashes separator is not parsed as options)
    writeShim(
      qsubDir,
      "qstat",
      "printf '%s\\n' 'Job ID Name User Time S Queue'\n" +
        "printf '%s\\n' '------ ---- ---- ---- - -----'\n" +
        "printf '%s\\n' '77777.silverback stub sweaver 0 R batch'"
    );
    // Baseline every case on the squeue branch — the CI config is
    // submit_type "local", which never execs a lister at all.
    config.submit_type = "slurm";
    await client.connect();
  });

  afterEach(function () {
    // every test mutates PATH (and some mutate the cached config object);
    // always restore the suite baseline so a failing test cannot poison the
    // rest of the run
    process.env.PATH = origPath;
    config.submit_type = "slurm";
  });

  after(async function () {
    process.env.PATH = origPath;
    config.submit_type = origSubmitType;
    var m = client.multi().del("active_jobs");
    seeded.forEach(function (id) {
      m.del(id);
    });
    await m.exec();
    client.destroy();
    fs.rmSync(shimBase, { recursive: true, force: true });
  });

  it("FAIL OPEN: scheduler snapshot failure leaves active_jobs and hashes untouched but still resolves", async function () {
    var id = track("test-455e-" + suffix + "-failopen");
    process.env.PATH = failDir; // ONLY the failing shims resolvable
    await client
      .multi()
      .del("active_jobs")
      // seed a duplicate on purpose: even the dedup rebuild must not run
      .rPush("active_jobs", [id, id])
      .hSet(id, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "999999991" }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client); // resolves despite the failure
    var entries = await client.lRange("active_jobs", 0, -1);
    entries.should.deepEqual([id, id]); // no rebuild, duplicate intact
    var obj = await client.hGetAll(id);
    obj.status.should.equal("running"); // not zombified
    should.not.exist(obj.error); // no script-error write
    var ttl = await client.ttl(id);
    ttl.should.equal(-1); // no TTL applied
    await client.del([id, "active_jobs"]);
  });

  it("FAIL OPEN on a hung lister: the 15s snapshot exec timeout resolves without touching active_jobs", async function () {
    // v3-only: the v2 module had no exec timeout, so a hung squeue hung the
    // boot gate forever. The promisified exec kills the child after 15s and
    // the error takes the same fail-open path as a nonzero exit.
    var id = track("test-455e-" + suffix + "-hung");
    process.env.PATH = hangDir + ":" + origPath;
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", id)
      .hSet(id, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "999999992" }),
      })
      .exec();
    var started = Date.now();
    await reconcile.reconcileActiveJobs(client);
    var elapsed = Date.now() - started;
    elapsed.should.be.aboveOrEqual(14000); // the timeout, not a fast failure
    elapsed.should.be.below(45000); // ...and not the shim's full sleep 60
    var entries = await client.lRange("active_jobs", 0, -1);
    entries.should.deepEqual([id]); // untouched
    (await client.hGet(id, "status")).should.equal("running");
    (await client.ttl(id)).should.equal(-1);
    await client.del([id, "active_jobs"]);
  });

  it("submit_type local: empty snapshot with no lister exec — in-flight entries are zombied", async function () {
    // v3-only: a restart severs the local child process and its watcher, so
    // local in-flight jobs are unfinalizable and zombie-marking is correct.
    // PATH holds ONLY the failing shims: if the local branch exec'd any
    // lister it would fail open and this test would see status "running".
    var id = track("test-455e-" + suffix + "-local");
    config.submit_type = "local";
    process.env.PATH = failDir;
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", id)
      .hSet(id, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "999999993" }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    (await client.hGet(id, "status")).should.equal("aborted");
    var ttl = await client.ttl(id);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.TERMINAL_TTL_SECONDS);
    (await client.lRange("active_jobs", 0, -1)).should.deepEqual([]);
    await client.del(id);
  });

  it("absent active_jobs list: resolves and unrelated keys are untouched", async function () {
    var doneHash = track("test-455e-" + suffix + "-donehash");
    var blobKey = track("test-455e-" + suffix + "-blob");
    liveSqueue([]);
    await client
      .multi()
      .del("active_jobs")
      // a terminal hash and a plain-string result blob must survive the
      // finalize + zombie sweep untouched (TYPE guard, terminal skip)
      .hSet(doneHash, { status: "completed" })
      .set(blobKey, "result-payload")
      .exec();
    await reconcile.reconcileActiveJobs(client);
    var entries = await client.lRange("active_jobs", 0, -1);
    entries.should.deepEqual([]);
    (await client.hGet(doneHash, "status")).should.equal("completed");
    (await client.ttl(doneHash)).should.equal(-1); // sweep never TTLs terminal hashes
    (await client.get(blobKey)).should.equal("result-payload");
    (await client.ttl(blobKey)).should.equal(-1);
    await client.del([doneHash, blobKey]);
  });

  it("zombifies a running entry whose torque_id field is raw non-JSON garbage", async function () {
    var id = track("test-455e-" + suffix + "-garbage");
    liveSqueue(["424242001"]); // scheduler is up, just doesn't know this job
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", id)
      .hSet(id, { status: "running", torque_id: "@@not json at all@@" })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    var obj = await client.hGetAll(id);
    obj.status.should.equal("aborted");
    JSON.parse(obj.error).type.should.equal("script error");
    var ttl = await client.ttl(id);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.TERMINAL_TTL_SECONDS);
    (await client.lRange("active_jobs", 0, -1)).should.deepEqual([]); // dropped from the rebuilt list
    await client.del(id);
  });

  it("zombifies a running entry whose parsed torque_id is null", async function () {
    // parseable JSON, but torque_id itself is null -> same zombie path
    var id = track("test-455e-" + suffix + "-nulltid");
    liveSqueue(["424242001"]);
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", id)
      .hSet(id, {
        status: "queued",
        torque_id: JSON.stringify({ torque_id: null }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    (await client.hGet(id, "status")).should.equal("aborted");
    var ttl = await client.ttl(id);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.TERMINAL_TTL_SECONDS);
    await client.del(id);
  });

  it("silently reaps a list entry with no backing hash, keeping a live sibling", async function () {
    var ghost = track("test-455e-" + suffix + "-ghost");
    var keeper = track("test-455e-" + suffix + "-keeper");
    liveSqueue(["424242010"]);
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", [ghost, keeper]) // ghost has NO hash
      .hSet(keeper, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "424242010" }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    (await client.lRange("active_jobs", 0, -1)).should.deepEqual([keeper]);
    (await client.exists(ghost)).should.equal(0); // no hash conjured for the ghost
    await client.del([keeper, "active_jobs"]);
  });

  it("rebuilds [a,b,a,b,a] to exactly [a,b] when both are live (atomic dedup, original order)", async function () {
    var a = track("test-455e-" + suffix + "-dup-a");
    var b = track("test-455e-" + suffix + "-dup-b");
    liveSqueue(["424242020", "424242021"]);
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", [a, b, a, b, a])
      .hSet(a, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "424242020" }),
      })
      .hSet(b, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "424242021" }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    (await client.lRange("active_jobs", 0, -1)).should.deepEqual([a, b]); // each survivor once, a-then-b order
    (await client.ttl(a)).should.equal(-1); // survivors stay TTL-less
    (await client.ttl(b)).should.equal(-1);
    await client.del([a, b, "active_jobs"]);
  });

  it("drops an already-cancelled entry from the list with the terminal retention ttl", async function () {
    // test/reconcile.js covers status=completed -> the completed TTL; this
    // is the other terminal branch (cancelled -> terminal TTL)
    var id = track("test-455e-" + suffix + "-cancelled");
    liveSqueue([]);
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", id)
      .hSet(id, {
        status: "cancelled",
        torque_id: JSON.stringify({ torque_id: "424242030" }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    (await client.lRange("active_jobs", 0, -1)).should.deepEqual([]);
    (await client.hGet(id, "status")).should.equal("cancelled"); // status untouched, only TTL'd
    var ttl = await client.ttl(id);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.TERMINAL_TTL_SECONDS);
    await client.del(id);
  });

  it("sweeps an in-flight hash orphaned outside active_jobs (pre-fix restart residue)", async function () {
    var orphan = track("test-455e-" + suffix + "-orphan");
    liveSqueue([]);
    await client
      .multi()
      .del("active_jobs") // orphan is NOT in the list
      .hSet(orphan, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "424242040" }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    (await client.hGet(orphan, "status")).should.equal("aborted");
    var ttl = await client.ttl(orphan);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.TERMINAL_TTL_SECONDS);
    await client.del(orphan);
  });

  it("qsub branch: qstat column-1 id keeps the matching in-flight entry alive with no ttl", async function () {
    var id = track("test-455e-" + suffix + "-qsub");
    // reconcile reads submit_type from the require-cached config at call
    // time, so mutating the shared object routes it down the qstat branch
    config.submit_type = "qsub";
    process.env.PATH = qsubDir + ":" + origPath;
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", id)
      .hSet(id, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "77777.silverback" }),
      })
      .exec();
    await reconcile.reconcileActiveJobs(client);
    (await client.lRange("active_jobs", 0, -1)).should.deepEqual([id]); // kept alive via qstat parse
    (await client.hGet(id, "status")).should.equal("running");
    (await client.ttl(id)).should.equal(-1); // in-flight survivor stays TTL-less
    await client.del([id, "active_jobs"]);
  });
});
