const _ = require("underscore");
const logger = require("./logger").logger;

var io = function(socket) {
  var self = this;
  self.socket = socket;
  
  logger.info("New socket connection established: " + socket.id);
  
  socket.on("disconnect", function() {
    logger.info("Socket disconnected: " + socket.id);
  });
  
  return self;
};

io.prototype.route = function(route, next) {

  var initRoutes = function(socket, routes) {
    _.each(routes, function(x, i) {
      // Check if key uses a stream
      var key = i;
      var callback = x;

      if (key.indexOf("spawn") != -1) {
        socket.on(key, function(stream, data) {
          logger.info(`Received event ${key} with data: ${JSON.stringify(data)}`);
          try {
            callback(stream, data);
            logger.info(`Successfully processed ${key} event`);
          } catch (error) {
            logger.error(`Error processing ${key} event: ${error.message}`);
            logger.error(error.stack);
          }
        });
      } else {
        socket.on(key, function(data) {
          logger.info(`Received event ${key} with data: ${JSON.stringify(data)}`);
          try {
            callback(data);
            logger.info(`Successfully processed ${key} event`);
          } catch (error) {
            logger.error(`Error processing ${key} event: ${error.message}`);
            logger.error(error.stack);
          }
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
