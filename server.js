/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

<<<<<<< HEAD
  Copyright (C) 2013
=======
  Copyright (C) 2015
>>>>>>> 8a658f9a846be4f96b57c320ccdbf2fcd72337f9
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
    path = require('path'),
    hivtrace = require('./app/hivtrace/hivtrace.js'),
    prime = require('./app/prime/prime.js'),
    busted = require('./app/busted/busted.js'),
    relax = require('./app/relax/relax.js'),
    absrel = require('./app/absrel/absrel.js'),
    ss = require('socket.io-stream'),
    JobQueue = require(__dirname + '/lib/jobqueue.js').JobQueue;

// For every new connection...
io.sockets.on('connection', function (socket) {

  // Acknowledge new connection
  socket.emit('connected', { hello: 'Ready to serve' });


  socket.on('job queue', function (jobs) {
    JobQueue(function(jobs) {
      socket.emit('job queue', jobs);
    });
  });
  
  /*socket.on ("stream", function (p) {
    console.log ("HMM");
  });*/

  // A job has been spawned by datamonkey, let's go to work
  ss(socket).on('spawn', function (stream, params) {

    
    if(params.job.type) {

      switch(params.job.type) {

        case 'hivtrace':
          new hivtrace.HIVTraceAnalysis(socket, stream, params.job.analysis);
          break;
        case 'prime':
          new prime.PrimeAnalysis(socket, stream, params);
          break;
        case 'busted':
          new busted.BustedAnalysis(socket, stream, params.job);
          break;
        case 'relax':
          new relax.RelaxAnalysis(socket, stream, params.job);
          break;
        case 'absrel':
          new absrel.aBSRELAnalysis(socket, stream, params.job);
          break;
        default:
          socket.emit('error', 'type not recognized');
          socket.disconnect();
      }

    } else {
      socket.emit('error', 'analysis type not supplied');
      socket.disconnect();
    }
  });
  
  // Log which user disconnected
  socket.on('disconnect', function () {
    io.sockets.emit('user disconnected');
  });

});
