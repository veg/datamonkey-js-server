/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2015
  Sergei L Kosakovsky Pond (spond@ucsd.edu)
  Steven Weaver (sweaver@ucsd.edu)
  Anthony Aylward (aaylward@ucsd.edu)

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

var fs = require('fs'),
    spawn = require('child_process').spawn,
    should = require('should'),
    path = require('path'),
    redis = require('redis'),
    _ = require('underscore');

var client = redis.createClient();
var JobQueue = require(path.join(__dirname, '/../lib/jobqueue.js')).JobQueue;

describe('job queue', function() {

  this.timeout(6000);

  before(function(done) {

    var after_five = _.after(5, function() {
      _.delay(done, 1000);
    });

    for (var i=0; i< 5; i++) { 
      var qsub = spawn('qsub', ['-o', '/dev/null', '-e', '/dev/null']);
      qsub.stdin.write('sleep 1');
      qsub.stdin.end();
      qsub.stdout.on('data', function (data) {
        var torque_id = String(data).replace(/\n$/, '');
        client.hset(torque_id, 'type', 'test');
        after_five();
      });
    }

  });

  it('return the job queue', function(done) {
    JobQueue(function(jobs) {
      jobs[0].should.have.property('id');
      jobs[0].should.have.property('status');
      jobs[0].should.have.property('creation_time');
      jobs[0].should.have.property('start_time');
      jobs[0].should.have.property('type');
      jobs[0].should.have.property('sites');
      jobs[0].should.have.property('sequences');
      done();
    });
  });

});
