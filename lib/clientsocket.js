const { createSubscriber } = require("./redis-client"),
  logger = require("./logger").logger;

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

  // redis@5 requires pub/sub to run on its own dedicated connection. The
  // shared client factory's createSubscriber() does client.duplicate() +
  // connect() and attaches an error handler. It is async, so we kick it off
  // here and gate teardown on the resulting promise so close() can never race
  // ahead of the subscribe (see leak fixes #397/#400).
  this._closed = false;
  this._ready = this.initializeServer();
}

/**
* Initializes by triggering socket events on redis channel events.
*
* In redis@5 there is NO `.on("message", ...)`: the listener is passed directly
* to subscribe() and receives (message, channel). We hold onto the connected
* subscriber so close() can unsubscribe/quit the exact same connection.
*/

ClientSocket.prototype.initializeServer = function() {
  // We need to attach to events emitted by the worker job
  var self = this;

  logger.info(`[DEBUG REDIS] Client subscribing to Redis channel: ${self.channel_id}`);

  var readyPromise = createSubscriber()
    .then(function(subscriber) {
      self.subscriber = subscriber;

      // If close() was already called before the subscriber finished
      // connecting, tear the fresh connection down immediately instead of
      // leaking it.
      if (self._closed) {
        return self._teardown();
      }

      return subscriber.subscribe(self.channel_id, function(message, channel) {
        logger.info(`[DEBUG REDIS] Received message on channel ${channel} for socket ${self.socket.id}`);
        logger.info(`[DEBUG REDIS] Message length: ${message.length} bytes`);

        try {
          var redis_packet = JSON.parse(message);
          logger.info(`[DEBUG REDIS] Message type: ${redis_packet.type}`);
          logger.info("emitting " + message);

          self.socket.emit(redis_packet.type, redis_packet);
          logger.info(`[DEBUG REDIS] Emitted ${redis_packet.type} event to client socket`);
        } catch (err) {
          // A malformed pub/sub message must not crash the worker. Log and drop it.
          logger.error(
            `Error handling Redis message on channel ${channel} for socket ${self.socket.id}: ${err.message}`
          );
          return;
        }
      });
    })
    .catch(function(err) {
      logger.error("Error initializing Redis subscriber: " + err.message);
    });

  // Bind the dedicated subscriber's lifetime to the browser socket so it is
  // released when the client disconnects instead of leaking a pub/sub
  // connection for every job. See issue #397.
  if (self.socket && typeof self.socket.on === "function") {
    self.socket.on("disconnect", function() {
      self.close();
    });
  }

  return readyPromise;
};

/**
* Tears down the dedicated Redis subscriber. Idempotent — safe to call from
* multiple triggers (socket disconnect, explicit call-site cleanup).
*
* The teardown is deferred until the async subscribe has settled (via _ready)
* so unsubscribe/quit always act on a fully-connected subscriber; otherwise a
* fast disconnect could race the connect() and leak the socket.
*/

ClientSocket.prototype.close = function() {
  if (this._closed) return;
  this._closed = true;

  var self = this;
  logger.info(`[REDIS] Closing subscriber for channel ${this.channel_id}`);

  // Wait for the (possibly still in-flight) subscribe to settle, then tear the
  // subscriber down. If the subscriber never connected, _teardown is a no-op.
  var readyPromise = this._ready || Promise.resolve();
  readyPromise.then(function() {
    return self._teardown();
  }).catch(function(err) {
    logger.error("Error closing Redis subscriber: " + err.message);
  });
};

/**
* Actually unsubscribe + quit the dedicated subscriber connection. redis@5 is
* promise-native, so quit() resolves once the connection is gracefully closed;
* on error we fall back to destroy() to force the socket shut.
*/

ClientSocket.prototype._teardown = function() {
  var self = this;
  var subscriber = this.subscriber;
  if (!subscriber) return Promise.resolve();
  this.subscriber = null;

  return subscriber
    .unsubscribe(self.channel_id)
    .then(function() {
      return subscriber.quit();
    })
    .catch(function(err) {
      logger.error("Error closing Redis subscriber: " + err.message);
      try {
        subscriber.destroy();
      } catch (e) {
        logger.error("Error force-ending Redis subscriber: " + e.message);
      }
    });
};

exports.ClientSocket = ClientSocket;
