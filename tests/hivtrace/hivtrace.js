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
    path      = require('path'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    hivtrace  = require(path.join(__dirname, '/../../app/hivtrace/hivtrace.js')),
    job       = require(path.join(__dirname, '/../../app/job.js')),
    winston   = require('winston'),
    ss        = require('socket.io-stream');

var socketURL = 'http://0.0.0.0:5000';
winston.level = 'warn';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };

describe('hivtrace jobrunner', function() {

  var fn = path.join(__dirname, '/res/552f030ddfb365a631365975');
  var params_file = path.join(__dirname, '/res/params.json');
  var params_stripdrams_file = path.join(__dirname, '/res/params_stripdrams.json');

  io.sockets.on('connection', function (socket) {
    ss(socket).on('hivtrace:spawn',function(stream, params){
      winston.info('spawning hivtrace');
      var hivtrace_job = new hivtrace.hivtrace(socket, stream, params);
    });

    socket.on('hivtrace:resubscribe',function(params){
      winston.info('resubscribing hivtrace');
      new job.resubscribe(socket, params.id);
    });

  });

  it.only('strip drams should complete', function(done) {

    this.timeout(195000);

    var params = JSON.parse(fs.readFileSync(params_stripdrams_file));
    var hivtrace_socket = clientio.connect(socketURL, options);
    var aligned_fasta_cnt = 0;

    hivtrace_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(hivtrace_socket).emit('hivtrace:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    hivtrace_socket.on('job created', function(data){
      winston.info('got job id');
    });

    hivtrace_socket.on('status update', function(data){
      winston.info('got status update!');
    });

    hivtrace_socket.on('aligned fasta', function(data){
      aligned_fasta_cnt += 1;
    });

    hivtrace_socket.on('completed', function(data) {
      winston.info('completed!');
      should.exist(data.results.trace_results);
      aligned_fasta_cnt.should.be.equal(1);
      done();
    });

    hivtrace_socket.on('script error', function(data) {
      throw new Error('job failed');
    });

  });


  it('lanl compare should complete', function(done) {

    this.timeout(195000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var hivtrace_socket = clientio.connect(socketURL, options);
    var aligned_fasta_cnt = 0;

    hivtrace_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(hivtrace_socket).emit('hivtrace:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    hivtrace_socket.on('job created', function(data){
      winston.info('got job id');
    });

    hivtrace_socket.on('status update', function(data){
      winston.info('got status update!');
    });

    hivtrace_socket.on('aligned fasta', function(data){
      aligned_fasta_cnt += 1;
    });

    hivtrace_socket.on('completed', function(data) {
      winston.info('completed!');
      should.exist(data.results.trace_results);
      should.exist(data.results.lanl_trace_results);
      aligned_fasta_cnt.should.be.equal(1);
      done();
    });

    hivtrace_socket.on('script error', function(data) {
      throw new Error('job failed');
    });

  });

  it('should cancel job', function(done) {

    this.timeout(5000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var hivtrace_socket = clientio.connect(socketURL, options);

    hivtrace_socket.on('connect', function(data) {
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(hivtrace_socket).emit('hivtrace:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    hivtrace_socket.on('job created', function(data) {
      winston.info('got job id');
      setTimeout(function() { process.emit('cancelJob', '') }, 1000);
    });

    hivtrace_socket.on('status update', function(data) {
      //winston.info('got status update!');
    });

    hivtrace_socket.on('script error', function(data) {
      // assert failure
      should.exist(data.stdout);
      done();
    });
  });

});

