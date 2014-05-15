var spawn_job = require('./spawn_job.js'),
    config = require('../config.json'),
    fs = require('fs'),
    ss = require('socket.io-stream');

// Pass socket to HIV Trace job
var HIVTraceAnalysis = function (socket, stream, params) {
  // Setup Analysis
  var trace_analysis = new spawn_job.DoHivTraceAnalysis();

  // On status updates, report to datamonkey-js
  trace_analysis.on('status update', function(status_update) {
    socket.emit('status update', status_update);
  });

  // On errors, report to datamonkey-js
  trace_analysis.on('error', function(error) {
    socket.emit('script error', error);
    socket.disconnect();
  });

  // When the analysis completes, return the results to datamonkey.
  trace_analysis.on('completed', function(results) {
    // Send trace and graph information
    socket.emit('completed', results);
    socket.disconnect();
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
    ss(socket).emit('server file', stream, params);
    fs.createReadStream(params.fp).pipe(stream);
    socket.once('server file saved', function () {
      params.cb();
    });
  });


  // Setup has been completed, run the job with the parameters from datamonkey
  stream.pipe(fs.createWriteStream(config.output_dir + params._id));
  trace_analysis.start(params);
}

exports.HIVTraceAnalysis = HIVTraceAnalysis;
