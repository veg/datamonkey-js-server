/**
 * absrel jobrunner test — socket.io v4.
 *
 * Migrated off the removed socket.io v3 `.listen(PORT)` API and the
 * `socket.io-stream` (ss) pipe pattern (unreliable on v4). Uses the shared
 * harness in test/helpers/socketharness.js which reproduces the exact
 * server-observable spawn(stream, params) behavior with plain v4 events and
 * delivers the fasta as raw file DATA (string) so hyphyjob writes it as-is and
 * does NOT hit the JSON.stringify(self.stream) circular-object crash.
 *
 * Pass bar = SUBMIT-AND-CANCEL: connect, spawn the job, wait for it to reach
 * SLURM (a torque/slurm job id is reported), then cancel and finish. We do NOT
 * wait for HyPhy to complete. The captured SLURM id is scancel'd in after() so
 * the datamonkey partition is not held for 72h.
 */

var fs      = require('fs'),
    should  = require('should'),
    winston = require('winston'),
    child   = require('child_process'),
    absrel  = require(__dirname + '/../../app/absrel/absrel.js'),
    job     = require(__dirname + '/../../app/job.js'),
    harness = require(__dirname + '/../helpers/socketharness.js');

var PORT = 5100;

winston.loglevel = 'info';

describe('absrel jobrunner', function() {

  var fn          = __dirname + '/res/Flu.fasta';
  var params_file = __dirname + '/res/params.json';

  var io;                 // socket.io v4 Server
  var absrel_socket;      // client socket
  var capturedTorqueId;   // SLURM job id, if the job reached the scheduler

  before(function() {
    // socket.io v4: `new io.Server(PORT)` opens the http server on PORT.
    // (Replaces the removed v3 `require('socket.io').listen(PORT)`.)
    io = harness.startServer(PORT);

    io.on('connection', function (socket) {
      // Mirror server.js: the "spawn" route is a plain socket.io listener whose
      // first emitted arg IS the stream. Construct absrel exactly like
      // `new absrel.absrel(socket, stream, params)`.
      harness.submitAndExpectStream(io, socket, 'absrel:spawn', function (sock, stream, params) {
        winston.info('spawning absrel');
        new absrel.absrel(sock, stream, params);
      });

      socket.on('absrel:resubscribe', function (params) {
        winston.info('resubscribing absrel');
        new job.resubscribe(socket, params.id);
      });
    });
  });

  after(function(done) {
    // Free the SLURM allocation if the job actually reached the scheduler, so
    // we don't leave a 72h reservation on the datamonkey partition.
    if (capturedTorqueId) {
      try {
        child.execSync('scancel ' + capturedTorqueId, { stdio: 'ignore' });
        winston.info('scancel ' + capturedTorqueId);
      } catch (e) {
        winston.warn('scancel failed for ' + capturedTorqueId + ': ' + e.message);
      }
    }
    if (absrel_socket) absrel_socket.disconnect();
    if (io) io.close(function () { done(); });
    else done();
  });

  it('should submit to SLURM and cancel', function(done) {

    // Long enough to reach sbatch submission; NOT long enough to wait for HyPhy
    // to finish (we cancel well before that).
    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    absrel_socket = harness.connectClient(PORT);

    var finished = false;
    function finishOnce() {
      if (finished) return;
      finished = true;
      // Global cancel for the in-process job lifecycle/registry teardown.
      process.emit('cancelJob', '');
      done();
    }

    // Pull the SLURM/torque id out of whatever relayed packet carries it.
    function captureId(data) {
      if (!data) return;
      var id = data.torque_id || data.job_id ||
               (data.torque_id && data.torque_id.torque_id);
      if (id) capturedTorqueId = id;
    }

    absrel_socket.on('connect', function () {
      winston.info('connected to server');
      // v4-safe replacement for ss.createStream()+pipe: emit the fasta file
      // DATA as arg 0 so it reaches self.stream as a string (see harness).
      harness.emitSpawn(absrel_socket, 'absrel:spawn', fn, params);
    });

    // Job reached the scheduler and got an id — this is the submit pass bar.
    absrel_socket.on('job created', function (data) {
      winston.info('got job id: ' + JSON.stringify(data));
      captureId(data);
      finishOnce();
    });

    // A status update is also proof the job submitted / is being tracked.
    absrel_socket.on('status update', function (data) {
      winston.warn(JSON.stringify(data));
      captureId(data);
      finishOnce();
    });

    // Non-terminal: we intentionally do NOT wait for completion.
    absrel_socket.on('completed', function (data) {
      winston.warn(data);
    });

    // A script error before submission is a real failure; surface it.
    absrel_socket.on('script error', function (data) {
      winston.warn('script error: ' + JSON.stringify(data));
      if (finished) return;
      finished = true;
      done(new Error('absrel job errored before reaching SLURM: ' + JSON.stringify(data)));
    });

  });

});
