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

var spawn_job = require('./spawn_relax.js'),
    config = require('../../config.json'),
    fs = require('fs'),
    ss = require('socket.io-stream');

// Pass socket to relax job
var RelaxAnalysis = function (socket, stream, params) {

  if(params.action == "recheck") {
    // Check if file exists
    var fn = __dirname + '/output/' + params.analysis._id;
    results_fn = fn + '.RELAX.json';

    if (fs.existsSync(results_fn)) {
      fs.readFile(results_fn, 'utf8', function (err, data) {
        if(err) {
          socket.emit('script error', {'error' : 'unable to read results file'});
          socket.disconnect();
        } else {
          socket.emit('completed', {'results' : data});
          socket.disconnect();
        }
      });
    } else {
      socket.emit('script error', {'error' : 'unable to read results file'});
    }

  } else {
    // Setup Analysis
    var relax_analysis = new spawn_job.DoRelaxAnalysis();

    // On status updates, report to datamonkey-js
    relax_analysis.on('status update', function(status_update) {
      socket.emit('status update', status_update);
    });

    // On errors, report to datamonkey-js
    relax_analysis.on('script error', function(error) {
      socket.emit('script error', error);
      socket.disconnect();
    });

    // When the analysis completes, return the results to datamonkey.
    relax_analysis.on('completed', function(results) {
      // Send trace and graph information
      socket.emit('completed', results);
      socket.disconnect();
    });

    // Report the torque job id back to datamonkey
    relax_analysis.on('job created', function(torque_id) {
      // Send trace and graph information
      socket.emit('job created', torque_id);
    });

    // Send file
    relax_analysis.on('progress file', function(params) {
      var stream = ss.createStream();
      ss(socket).emit('progress file', stream, {id : params.id });
      fs.createReadStream(params.fn).pipe(stream);
      socket.once('file saved', function () {
        params.cb();
      });
    });

    var fn = __dirname + '/output/' + params.analysis._id;
    stream.pipe(fs.createWriteStream(fn));

    stream.on('end', function(err) {
      if (err) throw err;
      // Pass filename in as opposed to generating it in spawn_relax
      relax_analysis.start(fn, params);
    });

  }

}

exports.RelaxAnalysis = RelaxAnalysis;
