var config = require('../config.json'),
    redis = require('redis'),
    winston = require('winston'),
    ss = require('socket.io-stream');


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
  this.subscriber = redis.createClient();
  this.subscriber.subscribe(this.channel_id);
  this.initializeServer();

}

/**
* Initializes by triggering socket events on redis channel events
*/

ClientSocket.prototype.initializeServer = function () {

  // We need to attach to events emitted by the worker job
  var self = this;
  self.subscriber.on('message', function(channel, message) {
    var redis_packet = JSON.parse(message);
    self.socket.emit(redis_packet.type, redis_packet);
    //socket.disconnect();
  }); 

};

exports.ClientSocket = ClientSocket;
