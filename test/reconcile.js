// #455 startup reconciliation tests. Requires a live SLURM scheduler
// (any non-qsub submit_type, e.g. "slurm") and a live, ISOLATED redis
// instance (config.json) —
// never against a production instance.
var exec = require("child_process").exec,
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  redisTtl = require("../lib/redis-ttl.js"),
  reconcile = require("../lib/reconcile.js");

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

describe("startup scheduler reconciliation (#455)", function() {
  this.timeout(30000);

  var suffix = Date.now();
  var liveId = "test-453-" + suffix + "-live";
  var zombieId = "test-453-" + suffix + "-zombie";
  var terminalId = "test-453-" + suffix + "-term";
  var sbatchId = null;

  before(function(done) {
    // Any non-qsub submit_type routes to SLURM in this codebase (prod v2
    // uses "slurm"); only skip when the scheduler is TORQUE.
    if (config.submit_type === "qsub") {
      this.skip();
      return;
    }
    // A real scheduler job so liveId survives the reconciliation
    exec(
      "sbatch --wrap 'sleep 180' --partition=" + (config.slurm_partition || "datamonkey"),
      function(error, stdout) {
        should.not.exist(error);
        sbatchId = stdout.toString().match(/\d+/)[0];
        client.multi([
          ["del", "active_jobs"],
          ["rpush", "active_jobs", liveId, zombieId, zombieId, terminalId],
          ["hset", liveId, "status", "running",
            "torque_id", JSON.stringify({ torque_id: sbatchId })],
          ["hset", zombieId, "status", "queued",
            "torque_id", JSON.stringify({ torque_id: "999999999" })],
          ["hset", terminalId, "status", "completed",
            "torque_id", JSON.stringify({ torque_id: "888888888" })]
        ]).exec(function(err) {
          should.not.exist(err);
          reconcile.reconcileActiveJobs(client, function() {
            // give the fire-and-forget hset/expire callbacks time to land
            setTimeout(done, 500);
          });
        });
      }
    );
  });

  after(function(done) {
    if (sbatchId) exec("scancel " + sbatchId);
    client.multi([
      ["lrem", "active_jobs", 0, liveId],
      ["del", liveId],
      ["del", zombieId],
      ["del", terminalId]
    ]).exec(function() {
      client.quit();
      done();
    });
  });

  it("keeps only the live job, exactly once", function(done) {
    client.lrange("active_jobs", 0, -1, function(err, entries) {
      should.not.exist(err);
      entries.should.deepEqual([liveId]);
      done();
    });
  });

  it("marks the zombie aborted with the terminal ttl", function(done) {
    client.hget(zombieId, "status", function(err, status) {
      should.not.exist(err);
      status.should.equal("aborted");
      client.ttl(zombieId, function(err, ttl) {
        should.not.exist(err);
        ttl.should.be.above(0);
        ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
        done();
      });
    });
  });

  it("gives the already-terminal hash the completed retention ttl", function(done) {
    client.ttl(terminalId, function(err, ttl) {
      should.not.exist(err);
      ttl.should.be.above(0);
      ttl.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
      done();
    });
  });

  it("leaves the live job hash without a ttl", function(done) {
    client.ttl(liveId, function(err, ttl) {
      should.not.exist(err);
      ttl.should.equal(-1);
      done();
    });
  });
});
