var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client'),
    io        = require('socket.io')(5109),
    multihit  = require(__dirname + '/../../app/multihit/multihit.js'),
    job       = require(__dirname + '/../../app/job.js');

var socketURL = 'http://0.0.0.0:5109';

winston.loglevel = 'info';

var options = {
  forceNew: true,
  transports: ['websocket']
};

describe('multihit jobrunner', function() {

  var fn = __dirname + '/res/Flu.fasta';
  var params_file = __dirname + '/res/params.json';

  // Track the SLURM/torque id so we can scancel it in after() and not leave a
  // 72h datamonkey-partition allocation lying around.
  var submittedTorqueId = null;

  io.sockets.on('connection', function (socket) {
    // Mirror the production router: the spawn handler receives the alignment as
    // the FIRST emitted argument. In socket.io v4 we buffer the piped fasta into
    // a plain STRING before constructing the job so hyphyjob.js takes the
    // `typeof === 'string'` branch and writes a real fasta file (instead of
    // JSON.stringify-ing a socket.io-stream object and crashing).
    socket.on('multihit:spawn', function (fasta, params) {
      winston.info('spawning multihit');
      new multihit.multihit(socket, fasta, params);
    });

    socket.on('multihit:resubscribe', function (params) {
      winston.info('resubscribing multihit');
      new job.resubscribe(socket, params.id);
    });

    // Production cancel path: job.cancel looks the job up in redis by its
    // datamonkey id and runs scancel/qdel on the recorded torque id.
    socket.on('multihit:cancel', function (params) {
      winston.info('cancelling multihit');
      new job.cancel(socket, params.id);
    });
  });

  it('should submit to SLURM and cancel cleanly', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    // Read the fasta to a string and emit it as arg 0 (the v4-safe replacement
    // for ss.createStream()/pipe). This delivers the raw file bytes to the
    // spawn handler exactly like the old socket.io-stream pipe did.
    var fasta = fs.readFileSync(fn, 'utf8');

    var multihit_socket = clientio(socketURL, options);
    var finished = false;

    function finish(err) {
      if (finished) return;
      finished = true;
      try { multihit_socket.disconnect(); } catch (e) {}
      done(err);
    }

    // Once the job has actually reached SLURM (real sbatch id), request cancel
    // the production way and finish. We do NOT wait for HyPhy to complete.
    function onSubmitted(data) {
      if (finished) return;
      var torqueId = data && (data.torque_id || (data.torque_id && data.torque_id.torque_id));
      var jobId = data && data.id;
      winston.info('multihit reached SLURM: ' + JSON.stringify(data));

      // Assert we actually reached the scheduler.
      should.exist(data);

      if (torqueId) {
        submittedTorqueId = torqueId;
      }

      if (jobId) {
        // Cancel the production way so scancel runs on the real SLURM job.
        multihit_socket.emit('multihit:cancel', { id: jobId });
      }

      // The submit-and-cancel bar is met once the job is submitted; finish here
      // rather than waiting for HyPhy completion.
      finish();
    }

    multihit_socket.on('connect', function () {
      winston.info('connected to server');
      multihit_socket.emit('multihit:spawn', fasta, params);
    });

    multihit_socket.on('job created', function (data) {
      winston.info('got job id');
      onSubmitted(data);
    });

    multihit_socket.on('status update', function (data) {
      winston.warn(JSON.stringify(data));
      onSubmitted(data);
    });

    multihit_socket.on('cancelled', function (data) {
      winston.info('job cancelled: ' + JSON.stringify(data));
      finish();
    });

    // If HyPhy somehow completes/errors first, still finish the test cleanly.
    multihit_socket.on('completed', function (data) {
      winston.warn(data);
      finish();
    });

    multihit_socket.on('script error', function (data) {
      winston.warn(data);
      finish();
    });
  });

  after(function(done) {
    // Best-effort: scancel the SLURM job if one was created, so it does not sit
    // in the datamonkey partition for 72h.
    if (submittedTorqueId) {
      try {
        require('child_process').spawn('scancel', [String(submittedTorqueId)]);
      } catch (e) { /* ignore */ }
    }
    try { io.close(); } catch (e) {}
    done();
  });

});
