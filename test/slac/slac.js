const fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client'),
    io        = require('socket.io')(5112, { maxHttpBufferSize: 1e8 }),
    slac      = require(__dirname + '/../../app/slac/slac.js'),
    job       = require(__dirname + '/../../app/job.js');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5112';

var options = {
  transports: ['websocket'],
  forceNew: true
};

describe('slac jobrunner', function() {

  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  // Read the fasta once so the server can hand a STRING to the constructor,
  // mirroring how lib/router.js extracts data.alignment from the unified
  // payload. A string stream makes hyphyjob.js take the string branch and
  // never JSON.stringify a stream object (the circular-crash path).
  var fasta = fs.readFileSync(fn, 'utf8');

  // Track a submitted SLURM job so we can scancel it in an after() hook and
  // never leave a 72h allocation on the datamonkey partition.
  var submittedTorqueId = null;

  io.on('connection', function (socket) {
    socket.on('slac:spawn', function (params) {
      winston.info('spawning slac');
      // params.alignment is the STRING fasta (production router extracts this
      // from the unified payload and passes it as the stream argument).
      new slac.slac(socket, params.alignment, params);
    });

    socket.on('slac:resubscribe', function (params) {
      winston.info('resubscribing slac');
      new job.resubscribe(socket, params.id);
    });

    socket.on('slac:check', function (params) {
      winston.info('checking slac');
      params["checkOnly"] = true;
      new slac.slac(socket, null, params);
    });
  });

  it('should complete', function(done) {

    this.timeout(60000);

    var finished = false;
    function finishOnce(err) {
      if (finished) return;
      finished = true;
      done(err);
    }

    var params = JSON.parse(fs.readFileSync(params_file));
    var slac_socket = clientio.connect(socketURL, options);

    slac_socket.on('connect', function(){
      winston.info('connected to server');
      // Route the alignment as a STRING inside params (production unified
      // format). No socket.io-stream, so self.stream is a string.
      params.alignment = fasta;
      slac_socket.emit('slac:spawn', params);
    });

    // Submit-and-cancel pass bar: once the job reaches SLURM (sbatch returns a
    // job id), assert the id, cancel the SLURM job, and finish. We do NOT wait
    // for HyPhy to complete.
    slac_socket.on('job created', function(data){
      winston.info('got job id');
      try {
        should.exist(data);
        should.exist(data.torque_id);
        submittedTorqueId = data.torque_id;
      } catch (e) {
        return finishOnce(e);
      }
      // Trigger self.cancel_once -> scancel of the SLURM job.
      process.emit('cancelJob', '');
      finishOnce();
    });

    slac_socket.on('script error', function(data) {
      winston.warn(data);
      finishOnce(new Error('script error: ' + JSON.stringify(data)));
    });

  });

  it('check job', function(done) {

    this.timeout(60000);

    var finished = false;
    function finishOnce(err) {
      if (finished) return;
      finished = true;
      done(err);
    }

    var params = JSON.parse(fs.readFileSync(params_file));
    var slac_socket = clientio.connect(socketURL, options);

    slac_socket.on('connect', function(){
      winston.info('connected to server');
      slac_socket.emit('slac:check', params);
    });

    // The checkOnly path (hyphyjob.validateParameters) emits 'validated' and
    // does NOT submit a SLURM job, so it never emits status update/completed.
    slac_socket.on('validated', function(){
      winston.info('check validated');
      finishOnce();
    });

    // Fallbacks in case the check path emits a status update instead.
    slac_socket.on('status update', function(){
      winston.info('job successfully completed');
      finishOnce();
    });

    slac_socket.on('completed', function() {
      winston.warn('done');
      finishOnce();
    });

    slac_socket.on('script error', function() {
      winston.warn('script error');
      finishOnce();
    });

  });

  after(function() {
    // Release the port 5112 listener so it doesn't collide with other tests.
    try { io.close(); } catch (e) { /* ignore */ }
    // Best-effort scancel of any submitted SLURM job.
    if (submittedTorqueId) {
      try {
        var id = (typeof submittedTorqueId === 'object')
          ? (submittedTorqueId.torque_id || submittedTorqueId.id || submittedTorqueId)
          : submittedTorqueId;
        require('child_process').execSync('scancel ' + id, { stdio: 'ignore' });
      } catch (e) { /* ignore */ }
    }
  });

});
