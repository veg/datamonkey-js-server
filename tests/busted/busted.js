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

var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    path      = require('path'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000),
    redis     = require('redis'),
    busted    = require(__dirname + '/../../app/busted/busted.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');


//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };
    
var client = redis.createClient();

describe('busted jobrunner', function() {

  var id = '5446bc0d355080301f18a8c6';
  var fn = path.join(__dirname, '/res/', id);
  var params_file = path.join(__dirname, '/res/params.json');

  client.del(id);

  io.sockets.on('connection', function (socket) {
    ss(socket).on('busted:spawn',function(stream, params){
      winston.info('spawning busted');
      var busted_job = new busted.busted(socket, stream, params);
    });

    socket.on('busted:resubscribe',function(params){
      winston.info('spawning busted');
      new job.resubscribe(socket, params.id);
    });

    socket.on('busted:cancel',function(params){
      winston.info('cancelling busted');
      new job.cancel(socket, params.id);
    });


  });


  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    busted_socket = clientio.connect(socketURL, options);

    busted_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(busted_socket).emit('busted:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    busted_socket.on('job created', function(data){
      winston.info('got job id');
    });


    busted_socket.on('completed', function(data){
      //TODO: Ensure output is correct
      winston.info('job successfully completed');
      done();
    });


  });

  it('should kill socket, resubscribe, then complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var busted_socket = clientio.connect(socketURL, options);

    busted_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(busted_socket).emit('busted:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    busted_socket.on('job created', function(data){
      winston.info('got job id');
      busted_socket.disconnect();

      var reconnect_socket = clientio.connect(socketURL, options);
      reconnect_socket.emit('busted:resubscribe', { id : id });
      reconnect_socket.on('completed', function(data){
        done();
      });

    });

  });

  it.only('should cancel job', function(done) {

    this.timeout(5000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var busted_socket = clientio.connect(socketURL, options);

    busted_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(busted_socket).emit('busted:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    busted_socket.on('job created', function(data){
      winston.info('got job id');
      busted_socket.disconnect();

      var reconnect_socket = clientio.connect(socketURL, options);
      reconnect_socket.emit('busted:cancel', { id : id });
      reconnect_socket.on('cancelled', function(data){
        done();
      });

    });

  });

  it('should cause an error and send output from stderr', function(done) {

    this.timeout(10000);

    var err_id = '5446bc0d355080301f18a8c6_ERROR';
    var err_fn = __dirname + '/res/' + err_id;
    var params_file = __dirname + '/res/err_params.json';
    var params = JSON.parse(fs.readFileSync(params_file));

    busted_socket = clientio.connect(socketURL, options);

    busted_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(busted_socket).emit('busted:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    busted_socket.on('script error', function(data){
      should.exist(data.stderr);
      data.stderr.should.not.be.empty;
      done();
    });

  });

  it('should clear job', function(done) {

    this.timeout(10000);

    var params = JSON.parse(fs.readFileSync(params_file));
    busted_socket = clientio.connect(socketURL, options);

    busted_socket.on('connect', function(data){
      var stream = ss.createStream();
      ss(busted_socket).emit('busted:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    busted_socket.on('cancel job', function(msg) {
      winston.warn('cancel called!');
    });

    busted_socket.on('job created', function(data) {
      // delete job and emit script error
      winston.info('submitting cancel on all jobs');
      process.emit('cancelJob', '');
    });

    busted_socket.on('script error', function(data) {
      winston.warn(data);
      done();
    });

  });

});

