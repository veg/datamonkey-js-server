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
