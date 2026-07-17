var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    child_process = require('child_process'),
    meme      = require(__dirname + '/../../app/meme/meme.js'),
    job       = require(__dirname + '/../../app/job.js');

// socket.io v4: Server(port) opens an http server on that port.
// Unique port 5108 for this test to avoid collisions with sibling tests.
var io = new (require('socket.io').Server)(5108, { transports: ['websocket'] });

//TODO: retrieve socket from config
var socketURL = 'http://127.0.0.1:5108';

var options = {
  forceNew: true,
  transports: ['websocket']
};


describe('meme jobrunner', function() {
  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  // Track any SLURM job id we create so we can cancel it in teardown and not
  // leave a 72h allocation sitting on the datamonkey partition.
  var slurm_job_id = null;

  // Mirror server.js:425-444 (the MEME "spawn" route) EXACTLY. lib/router.js
  // turns "meme:spawn" into a plain socket.io listener whose first argument is
  // whatever the client emitted as arg 0 (the fasta STRING). Using a plain
  // listener (not socket.io-stream) guarantees self.stream is a string, which
  // avoids the hyphyjob.js JSON.stringify circular-stream crash.
  io.sockets.on('connection', function (socket) {
    socket.on('meme:spawn', function (stream, params) {
      winston.info('spawning meme');
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      // Preserve tree-routing fields the MEME constructor reads.
      jobWithTree.analysis = params.analysis;
      jobWithTree.msa = params.msa;
      new meme.meme(socket, stream, jobWithTree);
    });

    socket.on('meme:resubscribe', function (params) {
      winston.info('resubscribing meme');
      new job.resubscribe(socket, params.id);
    });
  });

  after(function () {
    // Cancel any SLURM job we created so it doesn't occupy the datamonkey
    // partition for 72h.
    if (slurm_job_id) {
      try {
        child_process.execSync('scancel ' + slurm_job_id);
        winston.info('cancelled SLURM job ' + slurm_job_id);
      } catch (e) {
        winston.warn('scancel failed: ' + e.message);
      }
    }
    io.close();
  });

  it('should submit to SLURM and cancel cleanly', function(done) {

    // Only needs to reach sbatch and get a job id, not wait for HyPhy.
    this.timeout(60000);

    var finished = false;
    function finish(err) {
      if (finished) return;
      finished = true;
      // Fire the production cancel path (hyphyjob.js process.on('cancelJob')).
      process.emit('cancelJob', '');
      try { meme_socket.disconnect(); } catch (e) {}
      done(err);
    }

    var params = JSON.parse(fs.readFileSync(params_file));

    // Build production-shaped params: server.js reads params.job and derives
    // the id from job.id. params.json has no "job" key, so construct one.
    params.job = { id: 'test-meme-' + Date.now() };
    // Provide a tree the production way (params.tree), mirroring server.js.
    if (params.msa && params.msa[0]) {
      params.tree = params.msa[0].usertree || params.msa[0].nj;
    }

    var meme_socket = require('socket.io-client')(socketURL, options);

    meme_socket.on('connect', function(){
      winston.info('connected to server');
      // Read the fasta into a STRING and emit it as arg 0 (the unified stream
      // argument), exactly like the file bytes the old ss pipe delivered. This
      // keeps self.stream a string so hyphyjob writes it as-is.
      var alignment = fs.readFileSync(fn, 'utf8');
      meme_socket.emit('meme:spawn', alignment, params);
    });

    // 'job created' fires after sbatch returns a SLURM job id (job.js:224 ->
    // hyphyjob.onJobCreated -> redis publish -> ClientSocket emits to client).
    meme_socket.on('job created', function(data){
      winston.info('got job id: ' + JSON.stringify(data));
      try {
        should.exist(data);
        should.exist(data.torque_id);
        String(data.torque_id).length.should.be.above(0);
        slurm_job_id = data.torque_id;
      } catch (e) {
        return finish(e);
      }
      finish();
    });

    // Fail fast on a submit failure rather than hanging until timeout.
    meme_socket.on('script error', function(data) {
      winston.warn(data);
      finish(new Error('script error: ' + JSON.stringify(data)));
    });
  });

});
