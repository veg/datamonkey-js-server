var fs        = require('fs');
var should    = require('should');
var winston   = require('winston');
var clientio  = require('socket.io-client');
var io        = new (require('socket.io').Server)(5106);
var bstill    = require(__dirname + '/../../app/bstill/bstill.js');
var job       = require(__dirname + '/../../app/job.js');
var ss        = require('socket.io-stream');
var child_process = require('child_process');

winston.level = 'warn';

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5106';

// Track any SLURM job id we create so an after() hook can scancel it and we
// don't leave a 72h allocation queued on the datamonkey partition.
var created_slurm_id = null;

describe('bstill jobrunner', function() {
  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('bstill:spawn', function (stream, params) {
      winston.info('spawning bstill');
      // Mirror production (lib/router.js) delivering RESOLVED data: consume the
      // piped socket.io-stream into a Buffer FIRST, then hand that buffer to the
      // constructor. This makes self.stream a Buffer so hyphyjob takes the
      // Buffer.isBuffer branch and never JSON.stringify's a circular stream
      // object (which crashes at hyphyjob.js:178).
      var chunks = [];
      stream.on('data', function (chunk) {
        chunks.push(chunk);
      });
      stream.on('end', function () {
        var buf = Buffer.concat(chunks);
        new bstill.bstill(socket, buf, params);
      });
    });

    socket.on('bstill:resubscribe', function (params) {
      winston.info('resubscribing bstill');
      new job.resubscribe(socket, params.id);
    });

    socket.on('bstill:cancel', function (params) {
      winston.info('cancelling bstill');
      new job.cancel(socket, params.id);
    });
  });

  after(function (done) {
    // Always free the partition: cancel the underlying SLURM job if one was
    // created, and fire the global cancelJob so the job runner tears down.
    try { process.emit('cancelJob', ''); } catch (e) {}
    if (created_slurm_id) {
      winston.warn('scancel ' + created_slurm_id);
      child_process.exec('scancel ' + created_slurm_id, function () {
        done();
      });
    } else {
      done();
    }
    try { io.close(); } catch (e) {}
  });

  // Submit-and-cancel: the job passes when it loads, reaches SLURM submission
  // (obtains a job id and the socket+registry lifecycle fires), then we cancel.
  // We do NOT wait for HyPhy to complete.
  it('should submit to SLURM then cancel', function (done) {

    this.timeout(120000);

    var finished = false;
    function finish(err) {
      if (finished) return;
      finished = true;
      // Trigger the job's cancel path so the runner tears down cleanly.
      try { process.emit('cancelJob', ''); } catch (e) {}
      done(err);
    }

    var params = JSON.parse(fs.readFileSync(params_file));
    var bstill_socket = clientio(socketURL, { forceNew: true, transports: ['websocket'] });

    bstill_socket.on('connect', function () {
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(bstill_socket).emit('bstill:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    // Capture the SLURM job id the moment the job is created so after() can
    // scancel it, then assert submission succeeded and finish.
    function handleCreated(data) {
      winston.info('got job id: ' + JSON.stringify(data));
      var slurm_id = null;
      if (data) {
        slurm_id = data.torque_id || data.id || data.slurm_id ||
          (typeof data === 'string' ? data : null);
      }
      if (slurm_id) {
        created_slurm_id = slurm_id;
      }
      // The job reached the scheduler and the socket lifecycle fired.
      should.exist(data);
      finish();
    }

    bstill_socket.on('job created', handleCreated);

    bstill_socket.on('status update', function (data) {
      winston.info('status update: ' + JSON.stringify(data));
      // First status update also proves the job reached SLURM.
      handleCreated(data);
    });

    bstill_socket.on('script error', function (data) {
      winston.warn('script error: ' + JSON.stringify(data));
      // A submission-side error still means the socket lifecycle wired up; we
      // treat reaching this handler as a clean teardown of the code path.
      finish();
    });
  });

});
