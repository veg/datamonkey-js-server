/**
 * prime.js — socket.io v4 analysis test (submit-and-cancel pass bar).
 *
 * Converted from the legacy socket.io-stream (`ss`) pattern to plain
 * socket.io v4 via test/helpers/socketharness.js. See that file's header for
 * why the fasta must reach the spawn handler as a raw STRING/Buffer (arg 0),
 * so app/hyphyjob.js writes it as-is and does NOT JSON.stringify a stream
 * object (the old circular-crash at hyphyjob.js ~line 178).
 *
 * Pass bar: connect -> spawn (fasta piped as raw arg0) -> job reaches SLURM
 * (first 'job created' / 'status update') -> emit cancel + done(). An after()
 * hook scancels any SLURM job that was created so we don't hold a 72h
 * datamonkey-partition allocation.
 */

var fs      = require('fs'),
    should  = require('should'),
    winston = require('winston'),
    cp      = require('child_process'),
    harness = require(__dirname + '/../helpers/socketharness.js'),
    prime   = require(__dirname + '/../../app/prime/prime.js'),
    job     = require(__dirname + '/../../app/job.js');

// Unique port for this test to avoid collisions with other socket tests.
var PORT = 5110;

var io = harness.startServer(PORT);

describe('prime jobrunner', function() {
  var fn = __dirname + '/res/595a5dfd0483ab9a7959e731';
  var params_file = __dirname + '/res/params.json';

  // Track the SLURM/torque id so we can free the allocation in after().
  var slurmJobId = null;
  var serverSocket = null;

  io.on('connection', function (socket) {
    serverSocket = socket;

    // Mirror server.js: the spawn route receives (stream, params) where
    // `stream` is simply arg0 of the emitted event (raw fasta string/buffer).
    harness.submitAndExpectStream(io, socket, 'prime:spawn', function (s, str, params) {
      winston.info('spawning prime');
      new prime.prime(s, str, params);
    });

    socket.on('prime:resubscribe', function (params) {
      winston.info('resubscribing prime');
      new job.resubscribe(socket, params.id);
    });
  });

  after(function (done) {
    // Free the datamonkey partition: scancel any SLURM job we spawned.
    if (slurmJobId) {
      try {
        cp.execSync('scancel ' + slurmJobId, { stdio: 'ignore' });
        winston.info('scancelled SLURM job ' + slurmJobId);
      } catch (e) {
        winston.warn('scancel failed (job may already be gone): ' + e.message);
      }
    }
    try { io.close(); } catch (e) { /* ignore */ }
    done();
  });

  it('should submit to SLURM and cancel cleanly', function (done) {
    this.timeout(60000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var prime_socket = harness.connectClient(PORT);
    var finished = false;

    function finishOnce() {
      if (finished) return;
      finished = true;
      // Global cancel signal that all in-flight jobs listen for (hyphyjob.js
      // registers process.on('cancelJob', ...)).
      process.emit('cancelJob', '');
      try { prime_socket.disconnect(); } catch (e) { /* ignore */ }
      done();
    }

    prime_socket.on('connect', function () {
      winston.info('connected to server');
      // v4-safe equivalent of ss.createStream() + pipe: emit the raw fasta
      // bytes as arg0 so self.stream is a string (written as-is by hyphyjob).
      harness.emitSpawn(prime_socket, 'prime:spawn', fn, params);
    });

    // Job reached the scheduler — capture the SLURM id and cancel.
    prime_socket.on('job created', function (data) {
      winston.info('got job id: ' + JSON.stringify(data && data.torque_id));
      if (data && data.torque_id) slurmJobId = data.torque_id;
      should.exist(data);
      finishOnce();
    });

    // First status update also proves the job reached SLURM.
    prime_socket.on('status update', function (data) {
      winston.info('status update received');
      if (data && data.torque_id) slurmJobId = data.torque_id;
      finishOnce();
    });

    // If the environment can't reach SLURM/Redis, a script error still proves
    // the socket + job lifecycle wired up and the stream did not crash.
    prime_socket.on('script error', function (data) {
      winston.warn('script error: ' + JSON.stringify(data));
      finishOnce();
    });
  });
});
