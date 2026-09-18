// #453 lifecycle tests: terminal-TTL + persist behaviour on the redis@3
// callback API. Run against a live, ISOLATED redis instance (config.json) —
// never against a production instance.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  redisTtl = require("../lib/redis-ttl.js"),
  hyphyJob = require("../app/hyphyjob.js").hyphyJob;

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// Build a minimal hyphyJob stub without running its constructor chain.
function makeJobStub(id) {
  var obj = Object.create(hyphyJob.prototype);
  obj.id = id;
  obj.type = "test";
  obj.params = { msa: [{ sites: 10, sequences: 5 }] };
  obj.output_dir = os.tmpdir();
  obj.qsub_script_name = "test.sh";
  return obj;
}

describe("redis transient-data lifecycle (#453)", function() {
  this.timeout(10000);

  var suffix = Date.now();
  var seeded = [];

  function seedHash(id, done) {
    seeded.push(id);
    client.hset(id, "status", "queued", done);
  }

  after(function(done) {
    if (seeded.length === 0) {
      client.quit();
      done();
      return;
    }
    var pending = seeded.length;
    seeded.forEach(function(id) {
      client.lrem("active_jobs", 0, id, function() {
        client.del(id, function() {
          if (--pending === 0) {
            client.quit();
            done();
          }
        });
      });
    });
  });

  it("expireCompleted sets a ttl in (0, COMPLETED_TTL]", function(done) {
    var id = "test-453-" + suffix + "-completed";
    seedHash(id, function() {
      redisTtl.expireCompleted(client, id);
      setTimeout(function() {
        client.ttl(id, function(err, ttl) {
          should.not.exist(err);
          ttl.should.be.above(0);
          ttl.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
          done();
        });
      }, 100);
    });
  });

  it("expireTerminal sets a ttl in (0, TERMINAL_TTL] and skips falsy keys", function(done) {
    var id = "test-453-" + suffix + "-terminal";
    seedHash(id, function() {
      // falsy keys (onError can fire before torque_id exists) must be skipped
      // without throwing
      redisTtl.expireTerminal(client, id, undefined, null, "");
      setTimeout(function() {
        client.ttl(id, function(err, ttl) {
          should.not.exist(err);
          ttl.should.be.above(0);
          ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
          done();
        });
      }, 100);
    });
  });

  it("persistInFlight clears an existing ttl", function(done) {
    var id = "test-453-" + suffix + "-persist";
    seedHash(id, function() {
      client.expire(id, 600, function() {
        redisTtl.persistInFlight(client, id);
        setTimeout(function() {
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            ttl.should.equal(-1);
            done();
          });
        }, 100);
      });
    });
  });

  it("clamps 0/negative/garbage ttl config values to the fallback", function() {
    redisTtl.positiveTtl(0, 86400).should.equal(86400);
    redisTtl.positiveTtl(-5, 86400).should.equal(86400);
    redisTtl.positiveTtl("garbage", 3600).should.equal(3600);
    redisTtl.positiveTtl(undefined, 3600).should.equal(3600);
    redisTtl.positiveTtl(1200, 3600).should.equal(1200);
    redisTtl.COMPLETED_TTL_SECONDS.should.be.above(0);
    redisTtl.TERMINAL_TTL_SECONDS.should.be.above(0);
  });

  it("pushes the id into active_jobs exactly once across repeated onJobCreated", function(done) {
    var id = "test-453-" + suffix + "-once";
    var torque_id = "424242";
    seeded.push(id);
    seeded.push(torque_id);
    var job = makeJobStub(id);
    // The status watcher re-emits "job created" every queued poll tick — the
    // once() guard must survive repeated invocations on the same instance.
    job.onJobCreated({ torque_id: torque_id, status: "queued" });
    job.onJobCreated({ torque_id: torque_id, status: "queued" });
    job.onJobCreated({ torque_id: torque_id, status: "queued" });
    setTimeout(function() {
      client.lrange("active_jobs", 0, -1, function(err, entries) {
        should.not.exist(err);
        entries.filter(function(e) { return e === id; }).length.should.equal(1);
        done();
      });
    }, 200);
  });

  it("persists a resurrected id/torque pair carrying a stale terminal ttl", function(done) {
    var id = "test-453-" + suffix + "-resurrect";
    var torque_id = "424243";
    seeded.push(id);
    seeded.push(torque_id);
    client.hset(id, "status", "completed", function() {
      client.hset(torque_id, "datamonkey_id", id, function() {
        client.expire(id, 600, function() {
          client.expire(torque_id, 600, function() {
            var job = makeJobStub(id);
            job.onJobCreated({ torque_id: torque_id, status: "queued" });
            setTimeout(function() {
              client.ttl(id, function(err, ttl_id) {
                should.not.exist(err);
                ttl_id.should.equal(-1);
                client.ttl(torque_id, function(err, ttl_tid) {
                  should.not.exist(err);
                  ttl_tid.should.equal(-1);
                  done();
                });
              });
            }, 200);
          });
        });
      });
    });
  });

  it("onComplete marks completed, sets the retention ttl and drains active_jobs", function(done) {
    var id = "test-453-" + suffix + "-complete";
    var torque_id = "424244";
    seeded.push(id);
    seeded.push(torque_id);

    var results_fn = path.join(os.tmpdir(), "test-453-results-" + suffix + ".json");
    fs.writeFileSync(results_fn, JSON.stringify({ fits: {}, ok: true }));

    var job = makeJobStub(id);
    job.torque_id = torque_id;
    job.results_fn = results_fn;

    client.hset(torque_id, "datamonkey_id", id, function() {
      // pre-seed duplicate entries — lrem count 0 must drain them all
      client.rpush("active_jobs", id, id, function() {
        job.onComplete();
        var deadline = Date.now() + 5000;
        (function poll() {
          client.hget(id, "status", function(err, status) {
            if (status === "completed") {
              client.ttl(id, function(err, ttl) {
                should.not.exist(err);
                ttl.should.be.above(0);
                ttl.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
                client.lrange("active_jobs", 0, -1, function(err, entries) {
                  should.not.exist(err);
                  entries.indexOf(id).should.equal(-1);
                  fs.unlinkSync(results_fn);
                  done();
                });
              });
            } else if (Date.now() > deadline) {
              done(new Error("job never reached completed status"));
            } else {
              setTimeout(poll, 100);
            }
          });
        })();
      });
    });
  });
});
