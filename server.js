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

var config = require('./config.js'),
    io = require('socket.io').listen(config.port),
    spawn_job = require('./hivcluster/spawn_job.js');
    
// For every new connection...
io.sockets.on('connection', function (socket) {

  // Acknowledge new connection
  socket.emit('connected', { hello: 'Ready to serve' });

  // A job has been spawned by datamonkey, let's go to work
  socket.on('spawn', function (hiv_cluster_params) {

    // Setup Analysis
    var cluster_analysis = new spawn_job.DoHivClusterAnalysis();

    // On status updates, report to datamonkey-js
    cluster_analysis.on('status update', function(status_update) {
      socket.emit('status update', status_update);
    });

    // On errors, report to datamonkey-js
    cluster_analysis.on('error', function(error) {
      socket.emit('error', error);
    });

    // When the analysis completes, return the results to datamonkey.
    cluster_analysis.on('completed', function(results) {
      // Send cluster and graph information
      socket.emit('completed', results);
    });

    // Report the torque job id back to datamonkey
    cluster_analysis.on('job created', function(torque_id) {
      // Send cluster and graph information
      socket.emit('job created', torque_id);
    });
    
    // Setup has been completed, run the job with the parameters from datamonkey
    cluster_analysis.start(hiv_cluster_params);

  });
  
  // Log which user disconnected
  socket.on('disconnect', function () {
    io.sockets.emit('user disconnected');
  });

});

