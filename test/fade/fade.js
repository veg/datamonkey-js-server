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

// socket.io v4 migration: this test uses the shared harness in
// test/helpers/socketharness.js. The legacy socket.io-stream (`ss`) path is
// not reliable under socket.io v4, so we (a) build the server with
// require('socket.io')(PORT), (b) register a PLAIN socket.on('fade:spawn')
// handler (mirroring lib/router.js), and (c) emit the fasta as a materialized
// string so hyphyjob.js writes it as-is (string branch) instead of hitting the
// JSON.stringify circular-crash path with a stream object.

var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client'),
    io        = require('socket.io')(5103),
    fade      = require(__dirname + '/../../app/fade/fade.js'),
    job       = require(__dirname + '/../../app/job.js'),
    child_process = require('child_process');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5103';

var options = {
  forceNew: true,
  transports: ['websocket']
};


describe('fade jobrunner', function() {

  var fn = __dirname + '/res/upload.278155041617087.1';
  var params_file = __dirname + '/res/params.json';

  // Track the SLURM job id the job reports so we can scancel it as a safety
  // net in after() even if the in-band cancel path did not fire.
  var reported_slurm_id = null;

  io.on('connection', function (socket) {
    // Mirror lib/router.js: the spawn route is a plain socket.io listener and
    // the first emitted argument IS the "stream" the constructor receives.
    socket.on('fade:spawn', function(stream, params){
      winston.info('spawning fade');
      new fade.fade(socket, stream, params);
    });

    socket.on('fade:resubscribe', function(params){
      winston.info('resubscribing fade');
      new job.resubscribe(socket, params.id);
    });

  });

  after(function() {
    // Release port 5103 for other tests.
    io.close();
    // Safety net: cancel the real SLURM job if one was created and the in-band
    // cancel did not already reap it, so we never hold the datamonkey
    // partition for 72h.
    if (reported_slurm_id) {
      try {
        child_process.execSync('scancel ' + reported_slurm_id, { stdio: 'ignore' });
      } catch (e) {
        // job may already be cancelled/gone; ignore.
      }
    }
  });

  it('should submit to SLURM and cancel itself', function(done) {

    this.timeout(40000);

    var finished = false;
    function finish(err) {
      if (finished) return;
      finished = true;
      done(err);
    }

    var params = JSON.parse(fs.readFileSync(params_file));
    var fade_socket = clientio(socketURL, options);

    fade_socket.on('connect', function(data){
      winston.info('connected to server');
      // v4-safe replacement for ss.createStream()/pipe: emit the fasta as a
      // materialized string (arg 0) so self.stream is a string and hyphyjob
      // writes it as-is, avoiding the JSON.stringify circular crash.
      fade_socket.emit('fade:spawn', fs.readFileSync(fn, 'utf8'), params);
    });

    // Submit-and-cancel pass bar: 'job created' fires when SLURM returns a job
    // id. That is the floor we assert (the job reached sbatch). We then cancel
    // the real SLURM job via process.emit('cancelJob') and finish — we do NOT
    // wait for HyPhy completion.
    fade_socket.on('job created', function(data){
      winston.info('job created (reached SLURM): ' + JSON.stringify(data));
      should.exist(data);
      var slurm_id = data && (data.torque_id || data.id || data);
      should.exist(slurm_id);
      reported_slurm_id = slurm_id;
      // Cancel the underlying SLURM job (hyphyjob's process.on('cancelJob')
      // handler runs scancel) and tear down cleanly.
      process.emit('cancelJob', '');
      fade_socket.disconnect();
      finish();
    });

    // If SLURM emits a status update before/around job creation, treat it as
    // having reached the scheduler too and cancel.
    fade_socket.on('status update', function(data){
      winston.info('status update: ' + JSON.stringify(data));
      var slurm_id = data && (data.torque_id || data.id);
      if (slurm_id) reported_slurm_id = slurm_id;
      process.emit('cancelJob', '');
      fade_socket.disconnect();
      finish();
    });

    fade_socket.on('script error', function(data) {
      winston.warn(data);
      finish(new Error('script error: ' + JSON.stringify(data)));
    });

  });

});
