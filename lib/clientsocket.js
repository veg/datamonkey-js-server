const redis = require("redis"),
  logger = require("./logger").logger,
  config = require("../config.json");

/**
* Opens a socket between datamonkey and the client browser
* Subscribes user to redis channel that gives status updates
* concerning the job.
* For a list of valid status updates, visit the job model.
* @param socket {Object} Socket that is opened between datamonkey and client
* @param job_id {String} The id of the job
*/

function ClientSocket(socket, job_id) {
  this.channel_id = job_id;
  this.socket = socket;
  this.subscriber = redis.createClient({
    host: config.redis_host, port: config.redis_port
  });

  // Add error handler for Redis client
  this.subscriber.on("error", function(err) {
    logger.error("Redis subscriber error: " + err.message);
  });

  this.subscriber.subscribe(this.channel_id);
  this.initializeServer();
}

/**
* Initializes by triggering socket events on redis channel events
*/

ClientSocket.prototype.initializeServer = function() {
  // We need to attach to events emitted by the worker job
  var self = this;
  self.subscriber.on("message", function(channel, message) {
    var redis_packet = JSON.parse(message);
    logger.info("emitting " + message);
    self.socket.emit(redis_packet.type, redis_packet);
  });

  // Bind the dedicated subscriber's lifetime to the browser socket so it is
  // released when the client disconnects instead of leaking a pub/sub
  // connection for every job. See issue #397.
  if (self.socket && typeof self.socket.on === "function") {
    self.socket.on("disconnect", function() {
      self.close();
    });
  }
};

/**
* Tears down the dedicated Redis subscriber. Idempotent — safe to call from
* multiple triggers (socket disconnect, explicit call-site cleanup).
*/

ClientSocket.prototype.close = function() {
  if (this._closed) return;
  this._closed = true;

  logger.info(`[REDIS] Closing subscriber for channel ${this.channel_id}`);
  try {
    // Drop the message listener before quitting so a late message cannot emit
    // to an already-disconnected socket.
    this.subscriber.removeAllListeners("message");
    this.subscriber.unsubscribe(this.channel_id);
    this.subscriber.quit();
  } catch (err) {
    logger.error("Error closing Redis subscriber: " + err.message);
    try {
      this.subscriber.end(true);
    } catch (e) {
      logger.error("Error force-ending Redis subscriber: " + e.message);
    }
  }
};

exports.ClientSocket = ClientSocket;
