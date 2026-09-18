// #453 cancel-path tests: app/job.js cancel + lib/jobdel.js markCancelled on
// the redis@3 callback API. Run against a live, ISOLATED redis instance
// (config.json) — never against a production instance.
//
// No real scheduler jobs are submitted: scancel/qdel are PATH-shim fakes
// (exit 0 normally, exit 1 when the job id contains "fail") prepended to
// PATH for the duration of the suite.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  redisTtl = require("../lib/redis-ttl.js"),
  job = require("../app/job.js"),
  jobdel = require("../lib/jobdel.js");

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// Minimal stand-in for a socket.io socket — records emits and disconnects.
function makeSocket() {
  return {
    emitted: [],
    disconnected: false,
    emit: function(ev, data) {
      this.emitted.push({ event: ev, data: data });
    },
    disconnect: function() {
      this.disconnected = true;
    }
  };
}

// Poll `check(cb(bool))` every 100ms until it reports true, then call done();
// fail the test if `deadlineMs` elapses first.
function pollUntil(check, deadlineMs, done, label) {
  var deadline = Date.now() + deadlineMs;
  (function tick() {
    check(function(ok) {
      if (ok) return done();
      if (Date.now() > deadline) return done(new Error("timed out waiting for " + label));
      setTimeout(tick, 100);
    });
  })();
}

describe("cancel path terminal cleanup (#453)", function() {
  this.timeout(20000);

  var suffix = Date.now();
  var seeded = [];
  var shimDir = path.join(os.tmpdir(), "cancel-shims-" + suffix);
  var originalPath = process.env.PATH;
  var originalSubmitType = config.submit_type;

  function seed(key) {
    seeded.push(key);
    return key;
  }

  before(function() {
    // PATH-shim scancel/qdel: succeed unless the job id contains "fail".
    // spawn() resolves the binary through process.env.PATH at spawn time,
    // so prepending here is enough — no real scheduler calls are made.
    var shim = "#!/bin/sh\ncase \"$1\" in\n  *fail*) exit 1 ;;\n  *) exit 0 ;;\nesac\n";
    fs.mkdirSync(shimDir);
    ["scancel", "qdel"].forEach(function(name) {
      var p = path.join(shimDir, name);
      fs.writeFileSync(p, shim);
      fs.chmodSync(p, 493); // 0755
    });
    process.env.PATH = shimDir + ":" + originalPath;
  });

  after(function(done) {
    process.env.PATH = originalPath;
    config.submit_type = originalSubmitType;
    ["scancel", "qdel"].forEach(function(name) {
      try { fs.unlinkSync(path.join(shimDir, name)); } catch (e) { /* ignore */ }
    });
    try { fs.rmdirSync(shimDir); } catch (e) { /* ignore */ }

    if (seeded.length === 0) {
      client.quit();
      done();
      return;
    }
    var pending = seeded.length;
    seeded.forEach(function(key) {
      client.lrem("active_jobs", 0, key, function() {
        client.del(key, function() {
          if (--pending === 0) {
            client.quit();
            done();
          }
        });
      });
    });
  });

  it("job.cancel on a running job aborts the id, terminal-ttls both hashes, drains active_jobs dupes and emits ok", function(done) {
    var id = seed("test-453-cancelpath-" + suffix + "-running");
    var torque_id = seed("cp" + suffix + "_1");
    var socket = makeSocket();

    client.hmset(id, "status", "running", "torque_id",
      JSON.stringify({ torque_id: torque_id }), function(err) {
      should.not.exist(err);
      // duplicate active_jobs entries — the lrem count 0 must drain them all
      client.rpush("active_jobs", id, id, function(err) {
        should.not.exist(err);
        job.cancel(socket, id);
        pollUntil(function(cb) { cb(socket.disconnected); }, 8000, function(err) {
          if (err) return done(err);
          socket.emitted.length.should.equal(1);
          socket.emitted[0].event.should.equal("cancelled");
          socket.emitted[0].data.should.eql({ success: "ok" });
          client.hget(id, "status", function(err, status) {
            should.not.exist(err);
            status.should.equal("aborted");
            client.ttl(id, function(err, ttl_id) {
              should.not.exist(err);
              ttl_id.should.be.above(0);
              ttl_id.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
              client.ttl(torque_id, function(err, ttl_tid) {
                should.not.exist(err);
                ttl_tid.should.be.above(0);
                ttl_tid.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
                client.lrange("active_jobs", 0, -1, function(err, entries) {
                  should.not.exist(err);
                  entries.indexOf(id).should.equal(-1);
                  done();
                });
              });
            });
          });
        }, "socket disconnect after cancel");
      });
    });
  });

  it("slurm markCancelled sets status cancelled and a terminal ttl on the torque_id hash", function(done) {
    var torque_id = seed("cp" + suffix + "_2");
    jobdel.jobDelete(torque_id, function(err, code) {
      err.should.equal("");
      code.should.equal(0);
      client.hget(torque_id, "status", function(err, status) {
        should.not.exist(err);
        status.should.equal("cancelled");
        client.ttl(torque_id, function(err, ttl) {
          should.not.exist(err);
          ttl.should.be.above(0);
          ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
          done();
        });
      });
    });
  });

  it("slurm branch failure: no cancelled status and no ttl when scancel exits non-zero", function(done) {
    var torque_id = seed("cp" + suffix + "_fail3");
    client.hset(torque_id, "status", "running", function(err) {
      should.not.exist(err);
      jobdel.jobDelete(torque_id, function(err, code) {
        err.should.equal(torque_id + " : error : could not remove from queue");
        code.should.equal(1);
        // markCancelled runs only on scheduler-delete success — give any
        // stray writes a beat to land, then confirm the hash is untouched.
        setTimeout(function() {
          client.hget(torque_id, "status", function(err, status) {
            should.not.exist(err);
            status.should.equal("running");
            client.ttl(torque_id, function(err, ttl) {
              should.not.exist(err);
              ttl.should.equal(-1);
              done();
            });
          });
        }, 200);
      });
    });
  });

  it("rejects an invalid torque_id without spawning and without touching redis", function(done) {
    var torque_id = "bad;id-" + suffix; // fails /^[\w\.]+$/ — never seeded
    jobdel.jobDelete(torque_id, function(err, code) {
      err.should.equal(torque_id + " : error : could not remove from queue");
      code.should.equal(1);
      client.exists(torque_id, function(err, n) {
        should.not.exist(err);
        n.should.equal(0);
        done();
      });
    });
  });

  it("qsub branch: fresh-required jobdel with submit_type qsub drives markCancelled via qdel", function(done) {
    var torque_id = seed("cp" + suffix + "_4.node0");
    // jobDelete is chosen at require time from config.submit_type, so mutate
    // the cached config object and re-require lib/jobdel.js fresh.
    config.submit_type = "qsub";
    delete require.cache[require.resolve("../lib/jobdel.js")];
    var qsubJobdel = require("../lib/jobdel.js");

    function restore() {
      config.submit_type = originalSubmitType;
      // put a submit_type-correct module back in the require cache
      delete require.cache[require.resolve("../lib/jobdel.js")];
      require("../lib/jobdel.js");
    }

    qsubJobdel.jobDelete(torque_id, function(err, code) {
      try {
        err.should.equal("");
        code.should.equal(0);
      } catch (e) {
        restore();
        return done(e);
      }
      client.hget(torque_id, "status", function(err, status) {
        client.ttl(torque_id, function(err2, ttl) {
          restore();
          should.not.exist(err);
          status.should.equal("cancelled");
          should.not.exist(err2);
          ttl.should.be.above(0);
          ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
          done();
        });
      });
    });
  });

  it("markCancelled on a wrong-type (list) torque_id key logs the hset error but still applies the expire", function(done) {
    var torque_id = seed("cp" + suffix + "_5");
    client.rpush(torque_id, "not-a-hash", function(err) {
      should.not.exist(err);
      jobdel.jobDelete(torque_id, function(err, code) {
        // the hset WRONGTYPE error is swallowed (logged) — the delete still
        // reports success and the expire runs in the hset callback regardless
        err.should.equal("");
        code.should.equal(0);
        client.type(torque_id, function(err, type) {
          should.not.exist(err);
          type.should.equal("list");
          client.ttl(torque_id, function(err, ttl) {
            should.not.exist(err);
            ttl.should.be.above(0);
            ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
            done();
          });
        });
      });
    });
  });

  it("job.cancel on a completed job emits ok without touching the scheduler or applying a ttl", function(done) {
    var id = seed("test-453-cancelpath-" + suffix + "-completed");
    var socket = makeSocket();
    client.hmset(id, "status", "completed", "torque_id",
      JSON.stringify({ torque_id: "cp" + suffix + "_nosuch" }), function(err) {
      should.not.exist(err);
      job.cancel(socket, id);
      pollUntil(function(cb) { cb(socket.disconnected); }, 4000, function(err) {
        if (err) return done(err);
        socket.emitted.length.should.equal(1);
        socket.emitted[0].data.should.eql({ success: "ok" });
        client.hget(id, "status", function(err, status) {
          should.not.exist(err);
          status.should.equal("completed");
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            // completed-branch cancel is a no-op on retention: the onComplete
            // path owns the completed ttl, cancel must not shorten it
            ttl.should.equal(-1);
            done();
          });
        });
      }, "socket disconnect on completed-job cancel");
    });
  });

  it("job.cancel on a missing id emits success no", function(done) {
    var id = "test-453-cancelpath-" + suffix + "-missing"; // never seeded
    var socket = makeSocket();
    job.cancel(socket, id);
    pollUntil(function(cb) { cb(socket.emitted.length > 0); }, 4000, function(err) {
      if (err) return done(err);
      socket.emitted[0].event.should.equal("cancelled");
      socket.emitted[0].data.success.should.equal("no");
      socket.disconnected.should.equal(false);
      done();
    }, "cancelled emit for missing id");
  });

  it("job.cancel with an unparseable torque_id emits no, then still aborts + ttls the id (documented quirk)", function(done) {
    // QUIRK (pre-existing, documented — not introduced by #453): the catch
    // around JSON.parse(obj.torque_id) emits {success:"no"} but does NOT
    // return, so cancel proceeds with torque_id "" — jobDelete rejects it,
    // but the cancel callback ignores jobdel errors and still marks the id
    // aborted, applies the terminal ttl, drains active_jobs and emits
    // {success:"ok"}. Net effect: the client sees BOTH a "no" and an "ok".
    var id = seed("test-453-cancelpath-" + suffix + "-badtid");
    var socket = makeSocket();
    client.hmset(id, "status", "running", "torque_id", "not json", function(err) {
      should.not.exist(err);
      job.cancel(socket, id);
      pollUntil(function(cb) { cb(socket.disconnected); }, 4000, function(err) {
        if (err) return done(err);
        socket.emitted.length.should.equal(2);
        socket.emitted[0].data.success.should.equal("no");
        socket.emitted[1].data.should.eql({ success: "ok" });
        client.hget(id, "status", function(err, status) {
          should.not.exist(err);
          status.should.equal("aborted");
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            ttl.should.be.above(0);
            ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
            done();
          });
        });
      }, "socket disconnect on bad-torque_id cancel");
    });
  });
});
