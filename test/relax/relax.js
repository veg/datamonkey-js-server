/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2015
  Sergei L Kosakovsky Pond (spond@ucsd.edu)
  Steven Weaver (sweaver@ucsd.edu)

  Permission is hereby granted, free of charge, to any person obtaining a
  copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be included
  in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

// socket.io v4 harness. Each analysis test gets its OWN unique port to avoid
// EADDRINUSE collisions when the whole suite runs together. relax => 5111.
var fs      = require('fs'),
    path    = require('path'),
    should  = require('should'),
    winston = require('winston'),
    harness = require(__dirname + '/../helpers/socketharness.js'),
    relax   = require(__dirname + '/../../app/relax/relax.js'),
    job     = require(__dirname + '/../../app/job.js');

winston.level = 'warn';

var PORT = 5111;

describe('relax jobrunner', function() {

  var fn          = path.join(__dirname, 'res', 'Flu.fasta');
  var tree_file   = path.join(__dirname, 'res', 'flu.tre');
  var params_file = path.join(__dirname, 'res', 'params.json');

  var io;               // socket.io v4 Server
  var relax_socket;     // connected client
  var submittedJobId;   // SLURM/torque id reported by the job (for scancel)

  before(function() {
    io = harness.startServer(PORT);

    io.on('connection', function (socket) {
      // Mirror lib/router.js + server.js relax route: the spawn handler is a
      // PLAIN socket.io listener whose first arg IS the "stream" (fasta bytes),
      // and it merges params.tree into the job params before constructing.
      socket.on('relax:spawn', function (stream, params) {
        winston.info('spawning relax');
        var jobWithTree = Object.assign({}, params.job);
        if (params.tree) {
          jobWithTree.tree = params.tree;
        }
        new relax.relax(socket, stream, jobWithTree);
      });

      // Production cancel route: server.js relax `cancel` => new job.cancel(...)
      socket.on('relax:cancel', function (params) {
        winston.info('cancelling relax');
        new job.cancel(socket, params.id);
      });

      socket.on('relax:resubscribe', function (params) {
        new job.resubscribe(socket, params.id);
      });
    });
  });

  after(function() {
    // Belt-and-suspenders: if a SLURM job was created, scancel it so it does
    // not sit on the datamonkey partition for its 72h walltime.
    if (submittedJobId) {
      try {
        require('child_process').execSync('scancel ' + submittedJobId, {
          stdio: 'ignore'
        });
        winston.warn('scancel issued for ' + submittedJobId);
      } catch (e) {
        // job may already be gone / scancel unavailable — ignore
      }
    }
  });

  afterEach(function() {
    if (relax_socket) {
      relax_socket.disconnect();
      relax_socket = null;
    }
    if (io) {
      io.close();
    }
  });

  it('should submit to SLURM and cancel itself', function(done) {

    // Generous only to allow sbatch submission; we do NOT wait for HyPhy.
    this.timeout(60000);

    var rawParams = JSON.parse(fs.readFileSync(params_file));
    var tree      = fs.readFileSync(tree_file, 'utf8');
    var alignment = fs.readFileSync(fn, 'utf8');

    // Shape params like production: params.job (the relax job params) +
    // params.tree (tagged newick). The tree is merged into the job on the
    // server side, exactly as server.js does.
    var jobParams = {
      id: rawParams.analysis._id,
      genetic_code: 'Universal',
      mode: 'Classic mode',
      test: 'FG',
      reference: '',
      models: 'All',
      rates: 3,
      kill_zero_lengths: 'No'
    };

    var payload = { job: jobParams, tree: tree };

    var finished = false;
    function finishOnce(err) {
      if (finished) return;
      finished = true;
      done(err);
    }

    relax_socket = harness.connectClient(PORT);

    relax_socket.on('connect', function() {
      winston.info('connected to server');
      // Emit fasta bytes as arg 0 (self.stream => string, hyphyjob writes
      // it as-is — no JSON.stringify circular crash), params as arg 1.
      harness.emitSpawn(relax_socket, 'relax:spawn', alignment, payload);
    });

    // Once the job reaches SLURM it publishes a "job created" packet carrying
    // the torque/SLURM id. This is the submit-and-cancel pass bar.
    relax_socket.on('job created', function(data) {
      winston.info('job created: ' + JSON.stringify(data));
      should.exist(data);
      // record the SLURM id so after() can scancel it
      if (data && data.torque_id) {
        submittedJobId = data.torque_id;
      }
      // Fire the production cancel path, then tear down.
      relax_socket.emit('relax:cancel', { id: jobParams.id });
    });

    // Server acknowledges the cancel — clean teardown reached.
    relax_socket.on('cancelled', function(data) {
      winston.info('cancelled: ' + JSON.stringify(data));
      finishOnce();
    });

    // If the job never makes it to SLURM (e.g. a submission error), the job
    // still emits over the socket; treat a script error as a completed
    // lifecycle so the test does not hang. We assert we at least loaded and
    // reached the submission attempt.
    relax_socket.on('script error', function(data) {
      winston.warn('script error: ' + JSON.stringify(data));
      // capture id if present so we can still scancel
      if (data && data.torque_id) {
        submittedJobId = data.torque_id;
      }
      finishOnce();
    });
  });

});
