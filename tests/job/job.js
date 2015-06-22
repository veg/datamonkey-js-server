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

var fs      = require('fs'),
    spawn   = require('child_process').spawn,
    redis   = require('redis'),
    _       = require('underscore'),
    should  = require('should');

var job       = require(__dirname + '/../../app/job.js'),
    spawn_job = spawn_job = require(__dirname + '/../../app/busted/spawn_busted.js');

// Use redis as our key-value store
var client = redis.createClient()

describe('active jobs', function() {

  var id = '5446bc0d355080301f18a8c6',
      fn = __dirname + '/res/' + id,
      params_file = __dirname + '/res/params.json',
      params = JSON.parse(fs.readFileSync(params_file));

  it('list should be generated and then cleared', function(done) {

    this.timeout(120000);

    var afterJobsCleared = function() {
      // Ensure status of jobs are incomplete
      done();
    }

    // After job created called twice, run job remover
    var clearActiveJobsAfterTwoCalls = _.after(2, job.clearActiveJobs);

    // Create two busted jobs and kill them immediately
    var busted_analysis = new spawn_job.DoBustedAnalysis();
    busted_analysis.start(fn, params);

    var log_torque_id = function(torque_id) {
      var redis_packet = torque_id;
      redis_packet.type = 'job created';
      str_redis_packet = JSON.stringify(torque_id);
      client.hset(id, 'torque_id', str_redis_packet, redis.print);
      client.publish(id, str_redis_packet);
      client.rpush('active_jobs', id)
      clearActiveJobsAfterTwoCalls(afterJobsCleared);
    }

    var log_torque_id_once = _.once(log_torque_id);

    var second_busted_analysis = new spawn_job.DoBustedAnalysis();
    second_busted_analysis.start(fn, params);

    var second_log_torque_id = function(torque_id) {
      var redis_packet = torque_id;
      redis_packet.type = 'job created';
      str_redis_packet = JSON.stringify(torque_id);
      second_id = id + '_2';
      client.hset(second_id, 'torque_id', str_redis_packet, redis.print);
      client.publish(second_id, str_redis_packet);
      client.rpush('active_jobs', second_id)
      clearActiveJobsAfterTwoCalls(afterJobsCleared);
    };

    var second_log_torque_id_once = _.once(second_log_torque_id);

    // Report the torque job id back to datamonkey
    busted_analysis.on('job created', function(torque_id) {
      log_torque_id_once(torque_id);
    });

    second_busted_analysis.on('job created', function(torque_id) {
      second_log_torque_id_once(torque_id);
    });

  });

});
