// #455 startup reconciliation tests (v3 port of the v2 suite from PR #462).
// Requires a live SLURM scheduler (submit_type "slurm") and a live, ISOLATED
// redis instance (config.json) — never against a production instance.
//
// redis@5 port notes: dedicated promise client via the shared
// buildClientOptions() factory (NOT the shared client — this suite owns its
// connection lifetime); markZombie's hSet/expire are awaited inside
// reconcileActiveJobs now, so the v2 setTimeout(500) settle hack is gone.
var util = require("util"),
  execP = util.promisify(require("child_process").exec),
  should = require("should"),
  redis = require("redis"),
  config = require("../lib/config"),
  redisClient = require("../lib/redis-client"),
  reconcile = require("../lib/reconcile.js");

var client = redis.createClient(redisClient.buildClientOptions());

describe("startup scheduler reconciliation (#455)", function () {
  this.timeout(30000);

  var suffix = Date.now();
  var liveId = "test-455-" + suffix + "-live";
  var zombieId = "test-455-" + suffix + "-zombie";
  var terminalId = "test-455-" + suffix + "-term";
  var sbatchId = null;

  before(async function () {
    // Only the squeue branch is exercised here; local/qsub deployments have
    // no live SLURM scheduler to snapshot.
    if (config.submit_type !== "slurm") {
      this.skip();
      return;
    }
    await client.connect();
    // A real scheduler job so liveId survives the reconciliation
    var res = await execP(
      "sbatch --wrap 'sleep 180' --partition=" +
        (config.slurm_partition || "datamonkey")
    );
    sbatchId = res.stdout.toString().match(/\d+/)[0];
    await client
      .multi()
      .del("active_jobs")
      .rPush("active_jobs", [liveId, zombieId, zombieId, terminalId])
      .hSet(liveId, {
        status: "running",
        torque_id: JSON.stringify({ torque_id: sbatchId }),
      })
      .hSet(zombieId, {
        status: "queued",
        torque_id: JSON.stringify({ torque_id: "999999999" }),
      })
      .hSet(terminalId, {
        status: "completed",
        torque_id: JSON.stringify({ torque_id: "888888888" }),
      })
      .exec();
    // markZombie awaits its hSet + expire before resolving, so no settle
    // window is needed before asserting.
    await reconcile.reconcileActiveJobs(client);
  });

  after(async function () {
    if (sbatchId) await execP("scancel " + sbatchId).catch(function () {});
    if (client.isOpen) {
      await client
        .multi()
        .lRem("active_jobs", 0, liveId)
        .del(liveId)
        .del(zombieId)
        .del(terminalId)
        .exec();
      client.destroy();
    }
  });

  it("keeps only the live job, exactly once", async function () {
    var entries = await client.lRange("active_jobs", 0, -1);
    entries.should.deepEqual([liveId]);
  });

  it("marks the zombie aborted with the terminal ttl", async function () {
    var status = await client.hGet(zombieId, "status");
    status.should.equal("aborted");
    var ttl = await client.ttl(zombieId);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.TERMINAL_TTL_SECONDS);
  });

  it("gives the already-terminal hash the completed retention ttl", async function () {
    var ttl = await client.ttl(terminalId);
    ttl.should.be.above(0);
    ttl.should.be.belowOrEqual(redisClient.COMPLETED_TTL_SECONDS);
  });

  it("leaves the live job hash without a ttl", async function () {
    var ttl = await client.ttl(liveId);
    ttl.should.equal(-1);
  });
});
