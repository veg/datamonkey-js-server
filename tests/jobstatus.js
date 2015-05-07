/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2014
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

var fs      = require('fs'),
    spawn   = require('child_process').spawn,
    winston = require('winston'),
    should  = require('should');

var JobStatus = require(__dirname + '/../lib/jobstatus.js').JobStatus;

describe('job status', function() {

  it('should run until completed', function(done) {
    this.timeout(10000);

    var qsub = spawn('qsub');
    qsub.stdin.write('sleep 1');
    qsub.stdin.end();

    qsub.stdout.on('data', function (data) {

      id = data.toString().split('.')[0]
      var job_status = new JobStatus(id);

      job_status.watch(function(error, status) {

        winston.info(status);
        if(status == "completed" || status == "exiting") {
          // ensure full status returns appropriate metadata
          job_status.fullJobInfo(function(err, val) {
            val['total_runtime'].should.be.above(0); 
            val['exit_status'].should.be.equal('0'); 
            done();
          });
        } else {
          (status == "running" || status == "queued").should.be.equal(true, error);
        }

      });
    });
  });
});
