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

var config = require('./config.json'),
    io = require('socket.io').listen(config.port),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    winston = require('winston'),
    hivtrace = require('./app/hivtrace/hivtrace.js'),
    prime = require('./app/prime/prime.js'),
    busted = require('./app/busted/busted.js'),
    relax = require('./app/relax/relax.js'),
    absrel = require('./app/absrel/absrel.js'),
    job = require('./app/job.js'),
    ss = require('socket.io-stream'),
    router = require(__dirname + '/lib/router.js');
    JobQueue = require(__dirname + '/lib/jobqueue.js').JobQueue;

winston.level = config.loglevel;

// Global variable to hold array of all jobs
var alljobs = [];

// For every new connection...
io.sockets.on('connection', function (socket) {

  var r =  new router.io (socket);

  //Routes 
  socket.on('job queue', function (jobs) {
    JobQueue(function(jobs) {
      socket.emit('job queue', jobs);
    });
  });

  // HIV Trace
  r.route('hivtrace', {
    spawn : function (stream, params) {
      winston.log('info', params.job._id + ' : hivtrace : spawning');
      var hivtrace_job = new hivtrace.HIVTraceAnalysis(socket, stream, params.job.analysis);
      alljobs.push(hivtrace_job);
    },
    resubscribe : function(params) {
      winston.log('info', params.id + ' : hivtrace : resubscribing');
      new job.resubscribe(socket, params.id);
    },
    check : function(params) {
      winston.log('info', params.id + ' : hivtrace : checking');
      new job.check(socket, params.id);
    }
  });

  // PRIME
  r.route('prime', {
    spawn : function (stream, params) {
      winston.log('info', params.job._id + ' : prime : spawning');
      var prime_job = new prime.prime(socket, stream, params);
      alljobs.push(hivtrace_job);
    },
    resubscribe : function(params) {
      winston.log('info', params.id + ' : prime : resubscribing');
      new job.resubscribe(socket, id);
    },
    check : function(params) {
      winston.log('info', params.id + ' : prime : check');
      new job.check(socket, params.id);
    }
  });

  // BUSTED
  r.route('busted', {
    spawn : function (stream, params) {
      var busted_job = new busted.busted(socket, stream, params.job);
      alljobs.push(busted_job);
    },
    resubscribe : function(params) {
      winston.log('info', params.id + ' : busted : resubscribing');
      new job.resubscribe(socket, params.id); },
    check : function(params) {
      winston.log('info', params.id + ' : busted : checking');
      new job.check(socket, params.id);
    }
  });

  // RELAX
  r.route('relax', {
    spawn : function (stream, params) {
      winston.log('info', params.job._id + ' : relax : spawning');
      var relax_job = new relax.relax(socket, stream, params.job);
    },
    resubscribe : function(params) {
      winston.log('info', params.id + ' : relax : resubscribing');
      new job.resubscribe(socket, params.id);
    },
    check : function(params) {
      winston.log('info', params.id + ' : relax : checking');
      new job.check(socket, params.id);
    }
  });

  // aBSREL
  r.route('absrel', {
    spawn : function (stream, params) {
      winston.log('info', params.job._id + ' : absrel : spawning');
      new absrel.absrel(socket, stream, params.job);
    },
    resubscribe : function(params) {
      winston.log('info', JSON.stringify(params) + ' : absrel : resubscribing');
      new job.resubscribe(socket, params.id);
    },
    check : function(params) {
      winston.log('info', params.id + ' : absrel : checking');
      new job.check(socket, params.id);
    }
  });

  // Acknowledge new connection
  socket.emit('connected', { hello: 'Ready to serve' });

});

//so the program will not close instantly
process.stdin.resume();

function exitHandler(options, err) {

  // We need a collection of all jobs that are active
  if (options.cleanup) console.log('clean');
  if (err) console.log(err.stack);
  if (options.exit) process.exit();


  //job.clearActiveJobs(function(c) {
  //});

}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

process.on('SIGTERM', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

