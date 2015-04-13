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

var config = require(__dirname + '/../config.json'),
    _ = require('underscore'),
    Q = require('q'),
    ss = require('socket.io-stream'),
    winston = require('winston');

winston.level = config.loglevel;


var io = function(socket) {

  var self = this;
  self.socket = socket;

  socket.on('disconnect', function () {
  });

  return self;

}

io.prototype.route = function (route, next) {

  var initRoutes = function(socket, routes) {

    _.each(routes, function(x, i) { 

      // Check if key uses a stream
      var key = i;
      var callback = x;

      if (key.indexOf('spawn') != -1) {
        ss(socket).on(key, function(stream, data) {
          callback(stream, data);
        });
      } else {
        socket.on(key, function(data) {
          callback(data);
        });
      }

    });

  }

  // Set functions up for routing
  var self = this;
  routes = {};

  var c = 0;
  var next_length = _.keys(next).length;

  _.each(_.keys(next), function(i) { 
    var key =  route + ':' + i;
    routes[key] = next[i];
    if(++c == next_length) { 
      initRoutes(self.socket, routes);
    }
  });

}

exports.io = io;
