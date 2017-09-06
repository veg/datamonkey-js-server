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

var spawn = require('child_process').spawn,
    redis   = require('redis'),
    winston = require('winston');

// Use redis as our key-value store
var client = redis.createClient();

var jobDelete = function (torque_id, cb) {

  winston.info('job delete: ' + torque_id);

  var qdel = spawn('qdel', [torque_id]);

  qdel.on('close', function (code) {

    winston.warn(torque_id + ' : ' + code);

    if(code === 0) {
      winston.warn(torque_id + ' : removed from queue');
      client.hset(self.id, 'status', 'cancelled');
      // allow time for torque to write to stdout
      setTimeout(cb, 1000, '', code);
    } else {
      winston.warn(torque_id + ' : error : could not remove from queue');
      cb(torque_id + ' : error : could not remove from queue', code);
    }
  });


};

exports.jobDelete = jobDelete;
