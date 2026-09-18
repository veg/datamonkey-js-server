// #453 subclass lifecycle tests: gard/hivtrace carry their OWN copies of the
// terminal-TTL, active_jobs-drain and once()-push logic (they do not route
// through hyphyjob's onComplete/onJobCreated), so each copy is exercised here
// separately from the base-class tests in test/lifecycle.js.
//
// Run against a live, ISOLATED redis instance (config.json) — never against a
// production instance. No real scheduler jobs are submitted: gard/hivtrace
// instances are stubbed via Object.create(<ctor>.prototype) with real result
// files on disk and a fake socket, so onComplete/onJobCreated run their real
// redis code paths without spawning anything.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  redisTtl = require("../lib/redis-ttl.js"),
  jobRegistry = require("../lib/jobregistry.js"),
  gard = require("../app/gard/gard.js").gard,
  hivtrace = require("../app/hivtrace/hivtrace.js").hivtrace;

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// Fake socket that records emitted events; enough for sendNexusFile /
// the hivtrace "completed" emit.
function makeFakeSocket() {
  return {
    emitted: [],
    emit: function(event, payload) {
      this.emitted.push({ event: event, payload: payload });
    },
    on: function() {}
  };
}

// Build a gard stub without running its constructor (which would write tree
// files and build qsub params). Prototype methods (onComplete, sendNexusFile,
// inherited log/warn) are the real ones.
function makeGardStub(id, torque_id, socket) {
  var obj = Object.create(gard.prototype);
  obj.id = id;
  obj.torque_id = torque_id;
  obj.type = "gard";
  obj.socket = socket;
  obj.output_dir = os.tmpdir();
  obj.qsub_script_name = "gard.sh";
  return obj;
}

// Same for hivtrace: onComplete / onJobCreated are the real prototype
// methods; setTorqueParameters is inherited from hyphyjob and (submit_type
// !== "sbatch") takes the torque branch, so it needs output_dir +
// qsub_script_name and a string torque id.
function makeHivtraceStub(id, socket) {
  var obj = Object.create(hivtrace.prototype);
  obj.id = id;
  obj.type = "hivtrace";
  obj.socket = socket;
  obj.output_dir = os.tmpdir();
  obj.qsub_script_name = "hivtrace_submit.sh";
  return obj;
}

describe("gard/hivtrace subclass lifecycle (#453)", function() {
  this.timeout(10000);

  var suffix = Date.now();
  var seeded = []; // redis keys to delete in after()
  var registered = []; // registry ids to unregister in after()
  var tmpfiles = []; // result files to unlink in after()

  function tmpResultFile(name, contents) {
    var fn = path.join(os.tmpdir(), name);
    fs.writeFileSync(fn, contents);
    tmpfiles.push(fn);
    return fn;
  }

  after(function(done) {
    registered.forEach(function(id) { jobRegistry.unregister(id); });
    tmpfiles.forEach(function(fn) {
      try { fs.unlinkSync(fn); } catch (e) { /* already gone */ }
    });
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

  // ------------------------------------------------------------------ gard

  it("gard.onComplete marks completed, stores results, sets the completed ttl on id AND torque_id, and drains duplicate active_jobs entries", function(done) {
    var id = "test-453-sub-" + suffix + "-gard-complete";
    var torque_id = "515151";
    seeded.push(id);
    seeded.push(torque_id);

    var socket = makeFakeSocket();
    var job = makeGardStub(id, torque_id, socket);
    job.finalout_results_fn = tmpResultFile(
      "test-453-sub-" + suffix + ".best-gard",
      "#NEXUS\nbegin trees;\nend;\n"
    );
    job.results_fn = tmpResultFile(
      "test-453-sub-" + suffix + ".GARD.json",
      JSON.stringify({ breakpointData: {}, ok: true })
    );

    // torque_id reverse-lookup hash must exist for EXPIRE to bite
    client.hset(torque_id, "datamonkey_id", id, function() {
      // pre-seed DUPLICATE entries — lrem count 0 must drain them all
      client.rpush("active_jobs", id, id, function() {
        job.onComplete();
        var deadline = Date.now() + 5000;
        (function poll() {
          client.hget(id, "status", function(err, status) {
            if (status === "completed") {
              // the nexus buffer went out over the socket
              socket.emitted.some(function(e) {
                return e.event === "gard nexus file";
              }).should.be.true();
              client.hget(id, "results", function(err, raw) {
                should.not.exist(err);
                var packet = JSON.parse(raw);
                packet.type.should.equal("completed");
                JSON.parse(packet.results).ok.should.be.true();
                client.ttl(id, function(err, ttl_id) {
                  should.not.exist(err);
                  ttl_id.should.be.above(0);
                  ttl_id.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
                  client.ttl(torque_id, function(err, ttl_tid) {
                    should.not.exist(err);
                    ttl_tid.should.be.above(0);
                    ttl_tid.should.be.belowOrEqual(
                      redisTtl.COMPLETED_TTL_SECONDS
                    );
                    client.lrange("active_jobs", 0, -1, function(err, entries) {
                      should.not.exist(err);
                      entries.indexOf(id).should.equal(-1);
                      done();
                    });
                  });
                });
              });
            } else if (Date.now() > deadline) {
              done(new Error("gard job never reached completed status"));
            } else {
              setTimeout(poll, 100);
            }
          });
        })();
      });
    });
  });

  it("gard.onComplete unregisters the id from the job registry (new in #453 — gard previously never unregistered)", function(done) {
    var id = "test-453-sub-" + suffix + "-gard-unregister";
    var torque_id = "515152";
    seeded.push(id);
    seeded.push(torque_id);

    var socket = makeFakeSocket();
    var job = makeGardStub(id, torque_id, socket);
    job.finalout_results_fn = tmpResultFile(
      "test-453-sub-" + suffix + "-unreg.best-gard",
      "#NEXUS\nbegin trees;\nend;\n"
    );
    job.results_fn = tmpResultFile(
      "test-453-sub-" + suffix + "-unreg.GARD.json",
      JSON.stringify({ ok: true })
    );

    // The registry map is private, so observe unregistration behaviourally:
    // register a sentinel under the same id whose cancel() flips a flag, run
    // onComplete, then broadcast-cancel. Before #453 gard left the slot in
    // place, so cancelAll would have cancelled the finished job.
    var cancelled = false;
    var sentinel = {
      id: id,
      cancel: function() { cancelled = true; }
    };
    jobRegistry.register(sentinel);
    registered.push(id);

    job.onComplete();
    var deadline = Date.now() + 5000;
    (function poll() {
      client.hget(id, "status", function(err, status) {
        if (status === "completed") {
          // give the trailing unregister call (same tick as the hsets) a beat
          setTimeout(function() {
            jobRegistry.cancelAll();
            cancelled.should.be.false();
            done();
          }, 100);
        } else if (Date.now() > deadline) {
          done(new Error("gard job never reached completed status"));
        } else {
          setTimeout(poll, 100);
        }
      });
    })();
  });

  it("gard.onComplete routes a missing finalout file to onError and never marks completed or sets a ttl", function(done) {
    var id = "test-453-sub-" + suffix + "-gard-nofinalout";
    seeded.push(id);

    var socket = makeFakeSocket();
    var job = makeGardStub(id, "515153", socket);
    job.finalout_results_fn = path.join(
      os.tmpdir(),
      "test-453-sub-" + suffix + "-does-not-exist.best-gard"
    );
    job.results_fn = path.join(
      os.tmpdir(),
      "test-453-sub-" + suffix + "-does-not-exist.GARD.json"
    );
    // Stub onError as an OWN property so the real (heavier) implementation is
    // bypassed; we only assert the error routing here.
    var error_msg = null;
    job.onError = function(msg) { error_msg = msg; };

    client.hset(id, "status", "queued", function() {
      job.onComplete();
      setTimeout(function() {
        should.exist(error_msg);
        error_msg.should.match(/unable to read results file/);
        client.hget(id, "status", function(err, status) {
          status.should.equal("queued"); // never flipped to completed
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            ttl.should.equal(-1); // no terminal ttl from the completed path
            done();
          });
        });
      }, 300);
    });
  });

  // -------------------------------------------------------------- hivtrace

  it("hivtrace.onComplete sets the completed ttl on id AND torque_id and drains pre-seeded duplicate active_jobs entries", function(done) {
    var id = "test-453-sub-" + suffix + "-hiv-complete";
    var torque_id = "616161";
    seeded.push(id);
    seeded.push(torque_id);

    var socket = makeFakeSocket();
    var job = makeHivtraceStub(id, socket);
    job.torque_id = torque_id;
    job.output_cluster_output = tmpResultFile(
      "test-453-sub-" + suffix + "_user.trace.json",
      JSON.stringify({ trace_results: { Nodes: [], Edges: [] } })
    );

    client.hset(torque_id, "datamonkey_id", id, function() {
      // three duplicate entries — lrem count 0 must drain every one
      client.rpush("active_jobs", id, id, id, function() {
        job.onComplete();
        var deadline = Date.now() + 5000;
        (function poll() {
          // "completed" socket emit is the terminal signal on this path
          if (socket.emitted.some(function(e) { return e.event === "completed"; })) {
            setTimeout(function() {
              client.hget(id, "status", function(err, status) {
                status.should.equal("completed");
                client.ttl(id, function(err, ttl_id) {
                  should.not.exist(err);
                  ttl_id.should.be.above(0);
                  ttl_id.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
                  client.ttl(torque_id, function(err, ttl_tid) {
                    should.not.exist(err);
                    ttl_tid.should.be.above(0);
                    ttl_tid.should.be.belowOrEqual(
                      redisTtl.COMPLETED_TTL_SECONDS
                    );
                    client.lrange("active_jobs", 0, -1, function(err, entries) {
                      should.not.exist(err);
                      entries.indexOf(id).should.equal(-1);
                      done();
                    });
                  });
                });
              });
            }, 150);
          } else if (Date.now() > deadline) {
            done(new Error("hivtrace job never emitted completed"));
          } else {
            setTimeout(poll, 100);
          }
        })();
      });
    });
  });

  it("hivtrace.onComplete routes a missing cluster-output file to onError", function(done) {
    var id = "test-453-sub-" + suffix + "-hiv-noresults";
    seeded.push(id);

    var socket = makeFakeSocket();
    var job = makeHivtraceStub(id, socket);
    job.torque_id = "616162";
    job.output_cluster_output = path.join(
      os.tmpdir(),
      "test-453-sub-" + suffix + "-missing_user.trace.json"
    );
    var error_msg = null;
    job.onError = function(msg) { error_msg = msg; };

    job.onComplete();
    setTimeout(function() {
      should.exist(error_msg);
      error_msg.should.match(/no results found/);
      // no "completed" socket emit on the error path
      socket.emitted.some(function(e) {
        return e.event === "completed";
      }).should.be.false();
      done();
    }, 500);
  });

  it("hivtrace.onJobCreated pushes the id into active_jobs exactly once across three invocations (hivtrace's OWN once-guard copy)", function(done) {
    var id = "test-453-sub-" + suffix + "-hiv-once";
    var torque_id = "616163";
    seeded.push(id);
    seeded.push(torque_id);

    var job = makeHivtraceStub(id, makeFakeSocket());
    // The hivtrace status watcher re-emits "job created" on every queued poll
    // tick; the guard must be built once per instance, not once per call.
    job.onJobCreated({ torque_id: torque_id });
    job.onJobCreated({ torque_id: torque_id });
    job.onJobCreated({ torque_id: torque_id });
    setTimeout(function() {
      client.lrange("active_jobs", 0, -1, function(err, entries) {
        should.not.exist(err);
        entries.filter(function(e) { return e === id; }).length.should.equal(1);
        // cross-reference hash was written for the scheduler id
        client.hget(torque_id, "datamonkey_id", function(err, dmid) {
          should.not.exist(err);
          dmid.should.equal(id);
          done();
        });
      });
    }, 300);
  });

  it("hivtrace.onJobCreated persists stale terminal ttls on BOTH the resurrected id hash and the recycled torque_id hash", function(done) {
    var id = "test-453-sub-" + suffix + "-hiv-resurrect";
    var torque_id = "616164";
    seeded.push(id);
    seeded.push(torque_id);

    // Simulate a prior terminal transition: both hashes exist and carry a ttl
    client.hset(id, "status", "completed", function() {
      client.hset(torque_id, "datamonkey_id", id, function() {
        client.expire(id, 600, function() {
          client.expire(torque_id, 600, function() {
            var job = makeHivtraceStub(id, makeFakeSocket());
            job.onJobCreated({ torque_id: torque_id });
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
            }, 300);
          });
        });
      });
    });
  });
});
