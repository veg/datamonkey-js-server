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

var spawn_job = require('./spawn_flea.js'),
    config = require('../../config.json'),
    fs = require('fs'),
    path = require('path'),
    winston = require('winston'),
    ss = require('socket.io-stream');

// Pass socket to flea job
var flea = function (socket, stream, params) {

  log = function (notification) {
    winston.info(['flea', JSON.stringify(notification)].join(' : '));
  };

  // Setup Analysis
  var flea_analysis = new spawn_job.FleaRunner();

  // On status updates, report to datamonkey-js
  flea_analysis.on('status update', function(status_update) {
    socket.emit('status update', status_update);
    log(status_update);
  });

  // On errors, report to datamonkey-js
  flea_analysis.on('script error', function(error) {
    socket.emit('script error', error);
    socket.disconnect();
  });

  // When the analysis completes, return the results to datamonkey.
  flea_analysis.on('completed', function(results) {
    // Send trace and graph information
    socket.emit('completed', results);
    socket.disconnect();
  });

  // Report the torque job id back to datamonkey
  flea_analysis.on('job created', function(torque_id) {
    // Send trace and graph information
    socket.emit('job created', torque_id);
  });

  // Send file
  flea_analysis.on('progress file', function(params) {
    var stream = ss.createStream();
    ss(socket).emit('progress file', stream, {id : params.id });
    fs.createReadStream(params.fn).pipe(stream);
    socket.once('file saved', function () {
      params.cb();
    });
  });

  var fn = path.join(__dirname, '/output/', params.analysis._id + '.tar');
  stream.pipe(fs.createWriteStream(fn));

  socket.emit('status update', {'phase': params.status_stack[0], 'msg': ''});

  stream.on('end', function(err) {
    console.log('finished receiving data from datamonkey-dev');
    if (err) throw err;
    // Pass filename in as opposed to generating it in spawn_flea
    flea_analysis.start(fn, params);
  });

};

exports.flea = flea;

