var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    child_process = require('child_process'),
    clientio  = require('socket.io-client'),
    io        = require('socket.io')(5106),
    gard      = require(__dirname + '/../../app/gard/gard.js'),
    job       = require(__dirname + '/../../app/job.js');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5106';

var options = {
  forceNew: true,
  transports: ['websocket']
};


describe('gard jobrunner', function() {

  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  // Track any SLURM job id we create so we can free the partition in after().
  var created_slurm_id = null;

  io.sockets.on('connection', function (socket) {
    // Mirror lib/router.js: spawn routes are registered as PLAIN socket.io
    // listeners. In socket.io v4 the first emitted argument is whatever the
    // client sent as arg 0 (here the unified-format payload object), so we
    // replicate router.js's unified-format handling.
    socket.on('gard:spawn', function (stream, data) {
      // Unified format: the payload arrives as the first argument.
      if (data === undefined && stream && typeof stream === 'object') {
        data = stream;
        stream = data.alignment;
      }

      winston.info('spawning gard');

      // Merge tree data into job params, exactly like server.js's gard route.
      var jobWithTree = Object.assign({}, data.job);
      if (data.tree) {
        jobWithTree.tree = data.tree;
      }

      // stream is now the alignment STRING, so hyphyjob writes it as-is
      // without hitting the JSON.stringify circular-object crash.
      new gard.gard(socket, stream, jobWithTree);
    });

    socket.on('gard:resubscribe', function (params) {
      winston.info('resubscribing gard');
      new job.resubscribe(socket, params.id);
    });

  });

  after(function() {
    // Free the datamonkey partition if we created a real SLURM job so we do
    // not leave a 72h allocation hanging around.
    if (created_slurm_id) {
      try {
        child_process.execSync('scancel ' + created_slurm_id);
        winston.info('scancel issued for slurm job ' + created_slurm_id);
      } catch (e) {
        winston.warn('scancel failed: ' + e.message);
      }
    }
    // Free port 5106 so mocha --exit can shut down cleanly.
    io.close();
  });

  it('should submit and cancel', function(done) {

    // Enough time to reach sbatch, not to run HyPhy.
    this.timeout(45000);

    var params = JSON.parse(fs.readFileSync(params_file));

    // params.json is the older flat MEME-style params (no top-level `job`),
    // so wrap it as { job: params } exactly like the frontend/router expect.
    var jobParams = params.job ? params.job : params;
    var tree = params.tree ||
      (params.msa && params.msa[0] && (params.msa[0].usertree || params.msa[0].nj));

    // Read the alignment into a STRING (the v4-safe replacement for piping
    // the fasta through socket.io-stream).
    var fileContents = fs.readFileSync(fn, 'utf8');

    var finished = false;
    function finish(err) {
      if (finished) return;
      finished = true;
      try { gard_socket.disconnect(); } catch (e) {}
      done(err);
    }

    var gard_socket = clientio(socketURL, options);

    gard_socket.on('connect', function() {
      winston.info('connected to server');
      // Emit the single unified-format payload, matching what server.js/router
      // expect: router puts data.alignment into `stream` and passes data.job to
      // the gard constructor.
      gard_socket.emit('gard:spawn', {
        job: jobParams,
        tree: tree,
        alignment: fileContents,
        submission_source: 'test'
      });
    });

    // The job reached SLURM: onJobCreated published a "job created" packet to
    // redis, and ClientSocket relayed it back to us with the torque/slurm id.
    gard_socket.on('job created', function(data) {
      winston.info('got job id: ' + JSON.stringify(data));
      if (data && data.torque_id) {
        created_slurm_id = data.torque_id;
      }
      // Exercise the production cancel path (socket/registry teardown).
      process.emit('cancelJob', '');
      // Pass bar met: reached sbatch + got a job id.
      finish();
    });

    // A status update also proves the job reached SLURM.
    gard_socket.on('status update', function(data) {
      winston.info('status update: ' + JSON.stringify(data));
      if (data && data.torque_id && !created_slurm_id) {
        created_slurm_id = data.torque_id;
      }
      process.emit('cancelJob', '');
      finish();
    });

    gard_socket.on('script error', function(data) {
      winston.warn('script error: ' + JSON.stringify(data));
      // Do not fail on downstream (e.g. redis publish) errors once the job has
      // already been submitted; only fail if we never reached submission.
      if (!finished) {
        finish(new Error('script error before job submission: ' + JSON.stringify(data)));
      }
    });

  });

});
