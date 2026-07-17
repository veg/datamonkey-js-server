/**
 * contrast-fel.js — socket.io v4 analysis test (submit-and-cancel pass bar).
 *
 * Mirrors the production WebSocket path (server.js -> lib/router.js):
 *   socket.on('cfel:spawn', function (stream, params) {
 *       new cfel.cfel(socket, stream, params);
 *   });
 * The first emitted argument IS the "stream" the spawn handler receives. We
 * emit the fasta FILE DATA as a STRING (via the shared harness) so hyphyjob.js
 * writes it as-is and never hits the JSON.stringify(circular) crash.
 *
 * Pass bar: connect -> spawn -> on the first "job created"/"status update"
 * (proving the job loaded, reached SLURM and got a torque id and the
 * socket/registry lifecycle fired) capture the SLURM id, emit cancelJob to
 * tear down the in-process registry, scancel the SLURM job so it does not hold
 * the datamonkey partition for 72h, then call done() exactly once. We never
 * wait for HyPhy "completed".
 */

var fs       = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    path      = require('path'),
    harness   = require('../helpers/socketharness.js'),
    cfel      = require(__dirname + '/../../app/contrast-fel/cfel.js'),
    job       = require(__dirname + '/../../app/job.js');

var PORT = 5102;
var socketURL = 'http://0.0.0.0:' + PORT;

winston.level = 'warn';

// socket.io v4 server on a UNIQUE port (no collisions with sibling tests).
var io = harness.startServer(PORT);

describe('cfel jobrunner', function() {

  var fn = __dirname + '/res/Flu.fasta';
  var params_file = __dirname + '/res/params.json';

  // Capture the SLURM/torque id so an after() hook can scancel it.
  var submitted_torque_id = null;

  // Server-side connection handler mirroring server.js/router exactly.
  io.on('connection', function (socket) {
    harness.submitAndExpectStream(io, socket, 'cfel:spawn', function (s, str, params) {
      winston.info('spawning cfel');
      new cfel.cfel(s, str, params);
    });

    socket.on('cfel:resubscribe', function (params) {
      winston.info('resubscribing cfel');
      new job.resubscribe(socket, params.id);
    });
  });

  it('should submit to SLURM and cancel cleanly', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var cfel_socket = harness.connectClient(PORT);

    var finished = false;
    function finish(err) {
      if (finished) return;
      finished = true;
      // Tear down the in-process job registry.
      process.emit('cancelJob', '');
      // Best-effort: cancel the SLURM job so it does not hold the partition.
      if (submitted_torque_id) {
        try {
          var slurm_id = String(submitted_torque_id).split('.')[0];
          require('child_process').exec('scancel ' + slurm_id, function () {});
        } catch (e) { /* ignore */ }
      }
      cfel_socket.close();
      done(err);
    }

    // The job reached SLURM and reported a torque id: pass bar met.
    function onSubmitted(data) {
      winston.info('job reached SLURM');
      if (data && data.torque_id) {
        submitted_torque_id = data.torque_id;
      }
      submitted_torque_id.should.not.be.null;
      finish();
    }

    cfel_socket.on('connect', function () {
      winston.info('connected to server');
      // Emit the fasta as a STRING (arg 0) so self.stream is a string and
      // hyphyjob writes it as-is (no JSON.stringify circular crash).
      harness.emitSpawn(cfel_socket, 'cfel:spawn', fn, params);
    });

    cfel_socket.on('job created', function (data) {
      winston.info('got job id');
      onSubmitted(data);
    });

    cfel_socket.on('status update', function (data) {
      winston.info('status update received');
      onSubmitted(data);
    });

    cfel_socket.on('script error', function (data) {
      winston.warn(JSON.stringify(data));
      finish();
    });

    cfel_socket.on('completed', function (data) {
      winston.warn(JSON.stringify(data));
      finish();
    });
  });

  after(function (done) {
    this.timeout(15000);
    // Ensure any SLURM job we created is cancelled, then close the server.
    if (submitted_torque_id) {
      var slurm_id = String(submitted_torque_id).split('.')[0];
      require('child_process').exec('scancel ' + slurm_id, function () {
        io.close(function () { done(); });
      });
    } else {
      io.close(function () { done(); });
    }
  });

});
