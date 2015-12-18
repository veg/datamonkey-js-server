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
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    fade      = require(__dirname + '/../../app/fade/fade.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };


describe('fade jobrunner', function() {

  var fn = __dirname + '/res/upload.278155041617087.1';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('fade:spawn',function(stream, params){
      winston.info('spawning fade');
      var fade_job = new fade.fade(socket, stream, params);
    });

    socket.on('fade:resubscribe',function(params){
      winston.info('spawning fade');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should run and cancel itself', function(done) {

    this.timeout(15000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var fade_socket = clientio.connect(socketURL, options);

    fade_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(fade_socket).emit('fade:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    fade_socket.on('job created', function(data){
    });

    fade_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    fade_socket.on('script error', function(data) {
      winston.warn(data);
      done();
    });

  });

});

