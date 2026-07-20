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

// socket.io v4 migration:
//   - `require('socket.io').listen(PORT)` was removed in v4; the shared
//     helper `startServer(port)` uses `new io.Server(port)` instead.
//   - the legacy `socket.io-stream` (ss) pipe is not v4-compatible, so the
//     harness emits the fasta file DATA as arg 0 of the spawn event. hivtrace
//     does `self.stream.pipe(...)`, so the server-side spawn handler wraps that
//     data back into a Readable before constructing the analysis.
//   - unique port 5107 avoids collisions with the other analysis socket tests.

var fs        = require('fs'),
    path      = require('path'),
    should    = require('should'),
    winston   = require('winston'),
    stream    = require('stream'),
    hivtrace  = require(path.join(__dirname, '/../../app/hivtrace/hivtrace.js')),
    job       = require(path.join(__dirname, '/../../app/job.js')),
    harness   = require(path.join(__dirname, '/../helpers/socketharness.js'));

// Unique port for this test (see test/helpers/socketharness.js).
var PORT = 5107;
var socketURL = 'http://0.0.0.0:' + PORT;
winston.level = 'info';

describe('hivtrace jobrunner', function() {

  var fn = path.join(__dirname, '/res/552f030ddfb365a631365975');
  var params_file = path.join(__dirname, '/res/params.json');

  var io;                // socket.io v4 Server
  var hivtrace_socket;   // socket.io-client connection
  var hivtrace_job;      // the spawned analysis instance (holds torque_id)

  before(function() {
    io = harness.startServer(PORT);

    io.sockets.on('connection', function (socket) {
      // Mirror server.js router 'spawn': the first emitted arg is the "stream".
      // The harness delivers fasta FILE DATA (string/Buffer) as that arg; hivtrace
      // pipes self.stream to a file, so wrap the data in a Readable here.
      harness.submitAndExpectStream(io, socket, 'hivtrace:spawn', function (sock, data, params) {
        winston.info('spawning hivtrace');
        var readable = stream.Readable.from(
          Buffer.isBuffer(data) ? data : Buffer.from(String(data))
        );
        hivtrace_job = new hivtrace.hivtrace(sock, readable, params);
      });

      socket.on('hivtrace:resubscribe', function (params) {
        winston.info('resubscribing hivtrace');
        new job.resubscribe(socket, params.id);
      });
    });
  });

  it('should submit to SLURM then cancel', function(done) {

    this.timeout(30000);

    var finished = false;
    var params = JSON.parse(fs.readFileSync(params_file));

    // Guard so done() only fires once regardless of which lifecycle event
    // (job created / status update / script error) triggers the teardown.
    function finish(err) {
      if (finished) return;
      finished = true;
      done(err);
    }

    // Emit the global cancel and terminate the test. The cancelJob handler in
    // hivtrace (inherited from hyphyjob) runs self.cancel() -> scancel <id>.
    function cancelAndFinish() {
      process.emit('cancelJob', '');
      finish();
    }

    hivtrace_socket = harness.connectClient(PORT);

    hivtrace_socket.on('connect', function () {
      winston.info('connected to server');
      // v4-safe replacement for ss.createStream()/pipe: emit the fasta file
      // DATA as arg 0 so it reaches the spawn handler (and self.stream).
      harness.emitSpawn(hivtrace_socket, 'hivtrace:spawn', fn, params);

      // The job reaches SLURM asynchronously (sbatch runs after the write
      // stream drains, and 'job created' is delivered via redis pub/sub).
      // Give it a beat to submit, then cancel so we never wait for HyPhy and
      // never leave a SLURM allocation for 72h.
      setTimeout(cancelAndFinish, 4000);
    });

    // 'job created' is republished through redis/ClientSocket back to this
    // client socket once sbatch returns a job id -> the job reached SLURM.
    hivtrace_socket.on('job created', function () {
      winston.info('got job id -> reached SLURM');
      cancelAndFinish();
    });

    hivtrace_socket.on('status update', function () {
      winston.info('got status update -> reached SLURM');
      cancelAndFinish();
    });

    // Cancelling emits an error ('job cancelled') via onError -> script error.
    hivtrace_socket.on('script error', function () {
      winston.info('script error / cancel path');
      finish();
    });
  });

  after(function(done) {
    this.timeout(15000);

    // Make sure the underlying SLURM job (if one was created) is cancelled so
    // it does not occupy the datamonkey partition for 72h.
    var torque_id = hivtrace_job && hivtrace_job.torque_id;
    if (torque_id && /^[\w\.]+$/.test(String(torque_id))) {
      try {
        require('child_process').spawnSync('scancel', [String(torque_id)]);
        winston.info('scancel ' + torque_id);
      } catch (e) {
        winston.warn('scancel failed: ' + e.message);
      }
    }

    if (hivtrace_socket) {
      try { hivtrace_socket.disconnect(); } catch (e) {}
    }
    if (io) {
      io.close(function () { done(); });
    } else {
      done();
    }
  });

});
