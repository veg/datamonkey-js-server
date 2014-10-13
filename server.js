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
    path = require('path'),
    hivtrace = require('./app/hivtrace/hivtrace.js'),
    prime = require('./app/prime/prime.js'),
    busted = require('./app/busted/busted.js'),
    ss = require('socket.io-stream');

// For every new connection...
io.sockets.on('connection', function (socket) {

  // Acknowledge new connection
  socket.emit('connected', { hello: 'Ready to serve' });

  // A job has been spawned by datamonkey, let's go to work
  ss(socket).on('spawn', function (stream, params) {

    if(params.job.type) {

      switch(params.job.type) {
        case 'hivtrace':
          hivtrace.HIVTraceAnalysis(socket, stream, params.job.analysis);
          break;
        case 'prime':
          prime.PrimeAnalysis(socket, stream, params);
          break;
        case 'busted':
          busted.BustedAnalysis(socket, stream, params.job);
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

