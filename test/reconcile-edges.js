// #455 startup-reconciliation edge cases (gap group "reconcile-edges").
// Complements test/reconcile.js (happy path against a real SLURM job) with
// the fail-open path, the done-callback contract, zombie/reap edges, the
// atomic dedup rebuild, and the qsub parsing branch — all against PATH-shim
// scheduler binaries so no real jobs are ever submitted, and a live,
// ISOLATED redis instance (config.json) — never a production instance.
//
// server.js gates io.sockets.on("connection", ...) registration inside the
// reconcileActiveJobs callback; the "invokes done exactly once on every
// path" assertions here are what that gate depends on. (Exercising the
// socket wiring itself needs a full server boot with bound ports and is out
// of scope for this unit file.)
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  redisTtl = require("../lib/redis-ttl.js"),
  reconcile = require("../lib/reconcile.js");

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

describe("startup reconciliation edge cases (#455)", function() {
  this.timeout(30000);

  var suffix = Date.now();
  var seeded = [];
  var origPath = process.env.PATH;
  var origSubmitType = config.submit_type;

  var shimBase = path.join(os.tmpdir(), "ultra453-shims-" + process.pid);
  var failDir = path.join(shimBase, "fail");
  var liveDir = path.join(shimBase, "live");
  var qsubDir = path.join(shimBase, "qsub");

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
      ids.map(function(i) { return "echo " + i; }).join("\n") || "true"
    );
    process.env.PATH = liveDir + ":" + origPath;
  }

  function track(id) {
    seeded.push(id);
    return id;
  }

  // Run reconcile, then wait for the fire-and-forget hset/expire callbacks
  // inside markZombie/expire* to land before asserting. Also asserts the
  // done-callback contract: exactly one invocation within the settle window.
  function runReconcile(next) {
    var calls = 0;
    reconcile.reconcileActiveJobs(client, function() {
      calls++;
      setTimeout(function() {
        calls.should.equal(1);
        next();
      }, 400);
    });
  }

  before(function() {
    [failDir, liveDir, qsubDir].forEach(function(d) {
      fs.mkdirSync(d, { recursive: true });
    });
    // scheduler snapshot unavailable: nonzero exit from both listers
    writeShim(failDir, "squeue", "exit 2");
    writeShim(failDir, "qstat", "exit 2");
    // qstat output shape: two header lines, then one job per row, id first
    // (printf '%s\n' so the all-dashes separator is not parsed as options)
    writeShim(
      qsubDir,
      "qstat",
      "printf '%s\\n' 'Job ID Name User Time S Queue'\n" +
        "printf '%s\\n' '------ ---- ---- ---- - -----'\n" +
        "printf '%s\\n' '77777.silverback stub sweaver 0 R batch'"
    );
  });

  afterEach(function() {
    // every test mutates PATH (and test 6 mutates the cached config object);
    // always restore so a failing test cannot poison the rest of the run
    process.env.PATH = origPath;
    config.submit_type = origSubmitType;
  });

  after(function(done) {
    process.env.PATH = origPath;
    config.submit_type = origSubmitType;
    var ops = [["del", "active_jobs"]];
    seeded.forEach(function(id) {
      ops.push(["del", id]);
    });
    client.multi(ops).exec(function() {
      client.quit();
      fs.rmSync(shimBase, { recursive: true, force: true });
      done();
    });
  });

  it("FAIL OPEN: scheduler snapshot failure leaves active_jobs and hashes untouched but still invokes done", function(done) {
    var id = track("test-453e-" + suffix + "-failopen");
    process.env.PATH = failDir; // ONLY the failing shims resolvable
    client.multi([
      ["del", "active_jobs"],
      // seed a duplicate on purpose: even the dedup rebuild must not run
      ["rpush", "active_jobs", id, id],
      ["hset", id, "status", "running",
        "torque_id", JSON.stringify({ torque_id: "999999991" })]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.lrange("active_jobs", 0, -1, function(err, entries) {
          should.not.exist(err);
          entries.should.deepEqual([id, id]); // no rebuild, duplicate intact
          client.hgetall(id, function(err, obj) {
            should.not.exist(err);
            obj.status.should.equal("running"); // not zombified
            should.not.exist(obj.error); // no script-error write
            client.ttl(id, function(err, ttl) {
              should.not.exist(err);
              ttl.should.equal(-1); // no TTL applied
              client.del(id, function() {
                client.del("active_jobs", done);
              });
            });
          });
        });
      });
    });
  });

  it("absent active_jobs list: done fires exactly once and unrelated keys are untouched", function(done) {
    var doneHash = track("test-453e-" + suffix + "-donehash");
    var blobKey = track("test-453e-" + suffix + "-blob");
    liveSqueue([]);
    client.multi([
      ["del", "active_jobs"],
      // a terminal hash and a plain-string result blob must survive the
      // finalize + zombie sweep untouched (TYPE guard, terminal skip)
      ["hset", doneHash, "status", "completed"],
      ["set", blobKey, "result-payload"]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.lrange("active_jobs", 0, -1, function(err, entries) {
          should.not.exist(err);
          entries.should.deepEqual([]);
          client.multi([
            ["hget", doneHash, "status"],
            ["ttl", doneHash],
            ["get", blobKey],
            ["ttl", blobKey]
          ]).exec(function(err, res) {
            should.not.exist(err);
            res[0].should.equal("completed");
            res[1].should.equal(-1); // sweep never TTLs terminal hashes
            res[2].should.equal("result-payload");
            res[3].should.equal(-1);
            client.multi([["del", doneHash], ["del", blobKey]]).exec(function() {
              done();
            });
          });
        });
      });
    });
  });

  it("zombifies a running entry whose torque_id field is raw non-JSON garbage", function(done) {
    var id = track("test-453e-" + suffix + "-garbage");
    liveSqueue(["424242001"]); // scheduler is up, just doesn't know this job
    client.multi([
      ["del", "active_jobs"],
      ["rpush", "active_jobs", id],
      ["hset", id, "status", "running", "torque_id", "@@not json at all@@"]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.hgetall(id, function(err, obj) {
          should.not.exist(err);
          obj.status.should.equal("aborted");
          JSON.parse(obj.error).type.should.equal("script error");
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            ttl.should.be.above(0);
            ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
            client.lrange("active_jobs", 0, -1, function(err, entries) {
              should.not.exist(err);
              entries.should.deepEqual([]); // dropped from the rebuilt list
              client.del(id, done);
            });
          });
        });
      });
    });
  });

  it("zombifies a running entry whose parsed torque_id is null", function(done) {
    // parseable JSON, but torque_id itself is null -> same zombie path
    var id = track("test-453e-" + suffix + "-nulltid");
    liveSqueue(["424242001"]);
    client.multi([
      ["del", "active_jobs"],
      ["rpush", "active_jobs", id],
      ["hset", id, "status", "queued",
        "torque_id", JSON.stringify({ torque_id: null })]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.hget(id, "status", function(err, status) {
          should.not.exist(err);
          status.should.equal("aborted");
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            ttl.should.be.above(0);
            ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
            client.del(id, done);
          });
        });
      });
    });
  });

  it("silently reaps a list entry with no backing hash, keeping a live sibling", function(done) {
    var ghost = track("test-453e-" + suffix + "-ghost");
    var keeper = track("test-453e-" + suffix + "-keeper");
    liveSqueue(["424242010"]);
    client.multi([
      ["del", "active_jobs"],
      ["rpush", "active_jobs", ghost, keeper], // ghost has NO hash
      ["hset", keeper, "status", "running",
        "torque_id", JSON.stringify({ torque_id: "424242010" })]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.lrange("active_jobs", 0, -1, function(err, entries) {
          should.not.exist(err);
          entries.should.deepEqual([keeper]);
          client.exists(ghost, function(err, exists) {
            should.not.exist(err);
            exists.should.equal(0); // no hash conjured for the ghost
            client.multi([["del", keeper], ["del", "active_jobs"]]).exec(function() {
              done();
            });
          });
        });
      });
    });
  });

  it("rebuilds [a,b,a,b,a] to exactly [a,b] when both are live (atomic dedup, original order)", function(done) {
    var a = track("test-453e-" + suffix + "-dup-a");
    var b = track("test-453e-" + suffix + "-dup-b");
    liveSqueue(["424242020", "424242021"]);
    client.multi([
      ["del", "active_jobs"],
      ["rpush", "active_jobs", a, b, a, b, a],
      ["hset", a, "status", "running",
        "torque_id", JSON.stringify({ torque_id: "424242020" })],
      ["hset", b, "status", "running",
        "torque_id", JSON.stringify({ torque_id: "424242021" })]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.lrange("active_jobs", 0, -1, function(err, entries) {
          should.not.exist(err);
          entries.should.deepEqual([a, b]); // each survivor once, a-then-b order
          client.multi([["ttl", a], ["ttl", b]]).exec(function(err, ttls) {
            should.not.exist(err);
            ttls[0].should.equal(-1); // survivors stay TTL-less
            ttls[1].should.equal(-1);
            client.multi([["del", a], ["del", b], ["del", "active_jobs"]])
              .exec(function() { done(); });
          });
        });
      });
    });
  });

  it("drops an already-cancelled entry from the list with the terminal retention ttl", function(done) {
    // test/reconcile.js covers status=completed -> expireCompleted; this is
    // the other terminal branch (cancelled -> expireTerminal)
    var id = track("test-453e-" + suffix + "-cancelled");
    liveSqueue([]);
    client.multi([
      ["del", "active_jobs"],
      ["rpush", "active_jobs", id],
      ["hset", id, "status", "cancelled",
        "torque_id", JSON.stringify({ torque_id: "424242030" })]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.lrange("active_jobs", 0, -1, function(err, entries) {
          should.not.exist(err);
          entries.should.deepEqual([]);
          client.hget(id, "status", function(err, status) {
            should.not.exist(err);
            status.should.equal("cancelled"); // status untouched, only TTL'd
            client.ttl(id, function(err, ttl) {
              should.not.exist(err);
              ttl.should.be.above(0);
              ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
              client.del(id, done);
            });
          });
        });
      });
    });
  });

  it("sweeps an in-flight hash orphaned outside active_jobs (pre-fix restart residue)", function(done) {
    var orphan = track("test-453e-" + suffix + "-orphan");
    liveSqueue([]);
    client.multi([
      ["del", "active_jobs"], // orphan is NOT in the list
      ["hset", orphan, "status", "running",
        "torque_id", JSON.stringify({ torque_id: "424242040" })]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        client.hget(orphan, "status", function(err, status) {
          should.not.exist(err);
          status.should.equal("aborted");
          client.ttl(orphan, function(err, ttl) {
            should.not.exist(err);
            ttl.should.be.above(0);
            ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
            client.del(orphan, done);
          });
        });
      });
    });
  });

  it("qsub branch: qstat column-1 id keeps the matching in-flight entry alive with no ttl", function(done) {
    var id = track("test-453e-" + suffix + "-qsub");
    // reconcile reads submit_type from the require-cached config at call
    // time, so mutating the shared object routes it down the qstat branch
    config.submit_type = "qsub";
    process.env.PATH = qsubDir + ":" + origPath;
    client.multi([
      ["del", "active_jobs"],
      ["rpush", "active_jobs", id],
      ["hset", id, "status", "running",
        "torque_id", JSON.stringify({ torque_id: "77777.silverback" })]
    ]).exec(function(err) {
      should.not.exist(err);
      runReconcile(function() {
        config.submit_type = origSubmitType;
        client.lrange("active_jobs", 0, -1, function(err, entries) {
          should.not.exist(err);
          entries.should.deepEqual([id]); // kept alive via qstat parse
          client.hget(id, "status", function(err, status) {
            should.not.exist(err);
            status.should.equal("running");
            client.ttl(id, function(err, ttl) {
              should.not.exist(err);
              ttl.should.equal(-1); // in-flight survivor stays TTL-less
              client.multi([["del", id], ["del", "active_jobs"]]).exec(function() {
                done();
              });
            });
          });
        });
      });
    });
  });
});
