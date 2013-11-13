/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2013
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

var config = require('./config.json'),
    io = require('socket.io').listen(config.port),
    fs = require('fs'),
    spawn_job = require('./hivtrace/spawn_job.js'),
    ss = require('socket.io-stream');


//io.set('log level', 1);
    
// For every new connection...
io.sockets.on('connection', function (socket) {

  // Acknowledge new connection
  socket.emit('connected', { hello: 'Ready to serve' });

  // A job has been spawned by datamonkey, let's go to work
  socket.on('spawn', function (hiv_trace_params) {

    // Setup Analysis
    var trace_analysis = new spawn_job.DoHivTraceAnalysis();

    // On status updates, report to datamonkey-js
    trace_analysis.on('status update', function(status_update) {
      socket.emit('status update', status_update);
    });

    // On errors, report to datamonkey-js
    trace_analysis.on('error', function(error) {
      socket.emit('script error', error);
    });

    // When the analysis completes, return the results to datamonkey.
    trace_analysis.on('completed', function(results) {
      // Send trace and graph information
      socket.emit('completed', results);
    });

    // Report the torque job id back to datamonkey
    trace_analysis.on('job created', function(torque_id) {
      // Send trace and graph information
      socket.emit('job created', torque_id);
    });

    // Report tn93 summary back to datamonkey
    trace_analysis.on('tn93 summary', function(torque_id) {
      // Send trace and graph information
      socket.emit('tn93 summary', torque_id);
    });

    // Send file
    trace_analysis.on('dispatch file', function(params) {
      var stream = ss.createStream();
      ss(socket).emit('send file', stream, { id : params.id, type: params.type });
      fs.createReadStream(params.fn).pipe(stream);
      socket.once('file saved', function () {
        params.cb();
      });
    });

    // Setup has been completed, run the job with the parameters from datamonkey
    trace_analysis.start(hiv_trace_params);

  });
  
  // Log which user disconnected
  socket.on('disconnect', function () {
    io.sockets.emit('user disconnected');
  });

});

