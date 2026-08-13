/**
 * test/axomeme/axomeme.js — LIVE socket.io lifecycle for the AxoMEME job.
 *
 * Modeled on test/meme/meme.js (same harness: socket.io server + client, a
 * plain "axomeme:spawn" listener mirroring the server.js route shape), but
 * unlike the HyPhy suites this one runs the job to COMPLETION: AxoMEME is a
 * neural surrogate (lib/axomeme/cli.js, single-process node, no HYPHYMPI), so
 * with config.submit_type "local" the whole lifecycle — job created, status
 * updates, results delivery over redis — finishes end-to-end on this machine
 * in about a second (plus a cold ONNX model load).
 *
 * OBSERVER NOTE — why there is a dedicated redis subscriber here. In
 * production the ClientSocket subscribes to the job's redis channel
 * asynchronously while spawn() proceeds, and nothing gates the job start on
 * the subscribe landing. Scheduler latency (sbatch ~100ms+) hides that race
 * on SLURM, but a warm local AxoMEME run can publish 'job created' a few
 * milliseconds after submit — before the ClientSocket subscribe completes —
 * so the client socket can miss the earliest packet(s). The test therefore
 * pre-subscribes its own channel observer BEFORE emitting spawn: it sees the
 * exact packets production publishes, in publish order, with no race. The
 * client-socket listeners stay wired too (same packets, same shape), and
 * whichever transport delivers first drives the assertions.
 *
 * The completion assertion is deliberately shape-agnostic about HOW results
 * arrive (string vs object in the redis packet): whatever the transport does,
 * the payload must parse as JSON with method "AxoMEME" and isSurrogate true.
 * That pins the surrogate labeling all the way through the delivery path.
 */

var fs = require("fs"),
  should = require("should"),
  winston = require("winston"),
  child_process = require("child_process"),
  config = require(__dirname + "/../../lib/config"),
  redisClient = require(__dirname + "/../../lib/redis-client.js"),
  axomeme = require(__dirname + "/../../app/axomeme/axomeme.js");

// socket.io v4: Server(port) opens an http server on that port.
// Unique port 5113 for this test to avoid collisions with sibling tests
// (5101/5103/5105/5106/5108/5109/5112/5340/5341 are taken).
var PORT = 5113;
var io = new (require("socket.io").Server)(PORT, { transports: ["websocket"] });
var socketURL = "http://127.0.0.1:" + PORT;

var options = {
  forceNew: true,
  transports: ["websocket"]
};

describe("axomeme jobrunner", function () {
  var fasta_fn = __dirname + "/res/small.fasta";
  var tree_fn = __dirname + "/res/small.nwk";

  // Track any scheduler job id we create so a SLURM run can be cancelled in
  // teardown (local runs mint a "local_..." id; nothing to scancel).
  var scheduler_job_id = null;

  // Mirror the server.js spawn-route shape EXACTLY (see test/meme/meme.js):
  // lib/router.js turns "<type>:spawn" into a plain socket.io listener whose
  // first argument is whatever the client emitted as arg 0 (the fasta STRING),
  // which keeps self.stream a string so hyphyjob writes it as-is.
  io.sockets.on("connection", function (socket) {
    socket.on("axomeme:spawn", function (stream, params) {
      winston.info("spawning axomeme");
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      // Preserve the tree-routing fields the factory/descriptor reads
      // (msa[0].nj, analysis.msa[0].usertree, analysis.call_mode/max_species).
      jobWithTree.analysis = params.analysis;
      jobWithTree.msa = params.msa;
      new axomeme.axomeme(socket, stream, jobWithTree);
    });
  });

  after(function () {
    // A SLURM run must not leave an allocation behind; local runs have no
    // scheduler job to cancel.
    if (scheduler_job_id && config.submit_type === "slurm") {
      try {
        child_process.execSync("scancel " + scheduler_job_id);
        winston.info("cancelled SLURM job " + scheduler_job_id);
      } catch (e) {
        winston.warn("scancel failed: " + e.message);
      }
    }
    io.close();
  });

  it("runs the full lifecycle: job created -> status updates -> completed with AxoMEME results", function (done) {
    // Generous: covers a cold onnxruntime-node load plus the run itself. The
    // measured local end-to-end is about a second.
    this.timeout(180000);

    var finished = false;
    var got_job_created = false;
    var got_status_update = false;
    var test_subscriber = null;
    var client_socket = null;

    var alignment = fs.readFileSync(fasta_fn, "utf8");
    var tree = fs.readFileSync(tree_fn, "utf8").trim();
    var job_id = "test-axomeme-" + Date.now();

    function finish(err) {
      if (finished) return;
      finished = true;
      if (err) {
        // Fire the production cancel path so a half-spawned job (local child
        // process or scheduler allocation) is torn down, not leaked.
        process.emit("cancelJob", "");
      }
      // Leak-safe subscriber teardown (the #397/#400 contract).
      if (test_subscriber) {
        test_subscriber
          .unsubscribe(job_id)
          .then(function () {
            return test_subscriber.quit();
          })
          .catch(function () {});
      }
      if (client_socket) {
        try {
          client_socket.disconnect();
        } catch (e) {
          // already disconnected
        }
      }
      done(err);
    }

    // Every lifecycle packet — from the pre-subscribed redis observer or the
    // client socket, whichever delivers first — funnels through here. Publishes
    // all go through the one shared redis client, so the observer sees them in
    // publish order: 'job created' strictly precedes 'completed'.
    function onLifecyclePacket(packet, source) {
      if (finished || !packet || !packet.type) return;
      if (packet.type === "job created") {
        winston.info("job created via " + source + ": " + JSON.stringify(packet));
        try {
          should.exist(packet.torque_id);
          String(packet.torque_id).length.should.be.above(0);
          packet.analysis_type.should.equal("axomeme");
        } catch (e) {
          return finish(e);
        }
        scheduler_job_id = packet.torque_id;
        got_job_created = true;
      } else if (packet.type === "status update") {
        got_status_update = true;
      } else if (packet.type === "completed") {
        winston.info("job completed (via " + source + ")");
        try {
          got_job_created.should.equal(true, "'completed' arrived without a preceding 'job created'");
          got_status_update.should.equal(true, "no 'status update' was observed before completion");

          // Shape-agnostic extraction: the redis packet today is
          // { type: "completed", results: "<json string>" }, but the assertion
          // must hold even if results ever arrives pre-parsed.
          var results = packet.results !== undefined ? packet.results : packet;
          if (typeof results === "string") {
            results = JSON.parse(results);
          }
          should.exist(results);
          results.method.should.equal("AxoMEME");
          results.isSurrogate.should.equal(true);
          should.exist(results.sites);
          results.sites.length.should.be.above(0);
        } catch (e) {
          return finish(e);
        }
        finish();
      } else if (packet.type === "script error") {
        finish(new Error("script error: " + JSON.stringify(packet)));
      }
    }

    // Production-shaped params, mirroring test/meme/meme.js but with AxoMEME's
    // options (call_mode/max_species — there is NO genetic-code option, the
    // model bakes in universal) in analysis, the NJ tree nested at msa[0].nj
    // and the user tree at analysis.msa[0].usertree, the way the WebSocket
    // path delivers them.
    var params = {
      type: "axomeme",
      mail: "",
      job: { id: job_id },
      tree: tree,
      msa: [
        {
          _id: "axomeme-msa-" + Date.now(),
          datatype: 0,
          partitions: 1,
          sites: 30,
          sequences: 8,
          goodtree: 1,
          nj: tree,
          usertree: tree
        }
      ],
      analysis: {
        _id: job_id,
        call_mode: "percentile",
        max_species: 128,
        msa: [{ usertree: tree }]
      }
    };

    // Subscribe the observer to the job's channel FIRST; only then connect and
    // spawn, so no lifecycle packet can be published before we are listening.
    redisClient
      .createSubscriber()
      .then(function (sub) {
        test_subscriber = sub;
        return sub.subscribe(job_id, function (message) {
          try {
            onLifecyclePacket(JSON.parse(message), "redis");
          } catch (e) {
            finish(new Error("unparseable redis packet: " + message));
          }
        });
      })
      .then(function () {
        client_socket = require("socket.io-client")(socketURL, options);

        client_socket.on("connect", function () {
          winston.info("connected to server");
          // Emit the fasta as a STRING at arg 0 (the unified stream argument),
          // so self.stream stays a string and hyphyjob writes it verbatim.
          client_socket.emit("axomeme:spawn", alignment, params);
        });

        // Same packets, delivered through ClientSocket when its subscribe wins
        // the race (see OBSERVER NOTE in the header).
        client_socket.on("job created", function (data) {
          onLifecyclePacket(data, "socket");
        });
        client_socket.on("status update", function (data) {
          onLifecyclePacket(data, "socket");
        });
        client_socket.on("completed", function (data) {
          onLifecyclePacket(data, "socket");
        });
        client_socket.on("script error", function (data) {
          winston.warn(data);
          finish(new Error("script error: " + JSON.stringify(data)));
        });
      })
      .catch(function (err) {
        finish(new Error("could not subscribe to redis (is redis running?): " + err.message));
      });
  });
});
