const _ = require("underscore"),
  ss = require("socket.io-stream");

var io = function(socket) {

  var self = this;
  self.socket = socket;
  socket.on("disconnect", function() {});
  return self;

};

io.prototype.route = function(route, next) {

  var initRoutes = function(socket, routes) {
    _.each(routes, function(x, i) {
      // Check if key uses a stream
      var key = i;
      var callback = x;

      if (key.indexOf("spawn") != -1) {
        ss(socket).on(key, function(stream, data) {
          callback(stream, data);
        });
      } else {
        socket.on(key, function(data) {
          callback(data);
        });
      }
    });
  };

  // Set functions up for routing
  var self = this;
  var routes = {};

  var c = 0;
  var next_length = _.keys(next).length;

  _.each(_.keys(next), function(i) {
    var key = route + ":" + i;
    routes[key] = next[i];
    if (++c == next_length) {
      initRoutes(self.socket, routes);
    }
  });
};

exports.io = io;
