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
    fade = require('./app/fade/fade.js'),
    job = require('./app/job.js'),
    flea = require('./app/flea/flea.js'),
    ss = require('socket.io-stream'),
    redis   = require('redis'),
    router = require(path.join(__dirname, '/lib/router.js')),
    JobQueue = require(path.join(__dirname, '/lib/jobqueue.js')).JobQueue;

winston.level = config.loglevel;

var client = redis.createClient();

// clear active_jobs list
client.del('active_jobs');

// For every new connection...
io.sockets.on('connection', function (socket) {

  //Routes 
  socket.on('job queue', function (jobs) {
    JobQueue(function(jobs) {
      socket.emit('job queue', jobs);
    });
  });

  var r =  new router.io(socket);

  // HIV Trace
  r.route('hivtrace', {
    spawn : function (stream, params) {
      var hivtrace_job = new hivtrace.hivtrace(socket, stream, params.job.analysis);
    },
    resubscribe : function(params) {
      new job.resubscribe(socket, params.id);
    }
  });

  // FLEA
  r.route('flea', {
    spawn : function (stream, params) {
      var flea_job = new flea.flea(socket, stream, params.job);
    },
    resubscribe : function(params) {
      new job.resubscribe(socket, params.id);
    }
  });

  // PRIME
  r.route('prime', {
    spawn : function (stream, params) {
      var prime_job = new prime.prime(socket, stream, params);
    },
    resubscribe : function(params) {
      new job.resubscribe(socket, id);
    },
    cancel : function(params) {
      new job.cancel(socket, id);
    }
  });

  // BUSTED
  r.route('busted', {

    spawn : function (stream, params) {
      var busted_job = new busted.busted(socket, stream, params.job);
    },
    resubscribe : function(params) {
      new job.resubscribe(socket, params.id); 
    },
    cancel : function(params) {
      new job.cancel(socket, params.id); 
    }

  });

  // RELAX
  r.route('relax', {

    spawn : function (stream, params) {
      var relax_job = new relax.relax(socket, stream, params.job);
    },
    resubscribe : function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel : function(params) {
      new job.cancel(socket, params.id);
    }

  });

  // FADE
  r.route('fade', {
    spawn : function (stream, params) {
      var fade = new fade.fade(socket, stream, params.job);
    },
    resubscribe : function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel : function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // aBSREL
  r.route('absrel', {
    spawn : function (stream, params) {
      new absrel.absrel(socket, stream, params.job);
    },
    resubscribe : function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel : function(params) {
      new job.cancel(socket, params.id);
    }

  });

  // Acknowledge new connection
  socket.emit('connected', { hello: 'Ready to serve' });

});

//so the program will not close instantly
process.stdin.resume();


// retrieves active jobs from redis, and attempts to cancel
// all pending jobs
function jobCleanup(cb) {
  var total_job_count = 0;
  client.llen('active_jobs', function(err, n) {
    winston.info(n + ' active jobs left!');
    if(n == 0) {
      cb();
    } else {
      total_job_count = n;
      process.emit('cancelJob', '');
      process.on('jobCancelled', function(msg) {
        total_job_count--;
        if(total_job_count <= 0) {
          cb();
        }
      });
    }
  });
}


function exitHandler(options, err) {

  var exit = function() {
    if (options.cleanup) console.log('clean');
    if (err) console.log(err.stack);
    if (options.exit) process.exit();
  }

  jobCleanup(exit);

  // If jobCleanup does not complete within five seconds, 
  // skip attempt and exit.
  setTimeout(exit, 5000);

}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGTERM', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

