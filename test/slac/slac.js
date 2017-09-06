var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    slac      = require(__dirname + '/../../app/slac/slac.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options = {
  transports: ['websocket'],
  'force new connection': true
};

describe('slac jobrunner', function() {

  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('slac:spawn',function(stream, params){
      winston.info('spawning slac');
      var slac_job = new slac.slac(socket, stream, params);
    });

    socket.on('slac:resubscribe',function(params){
      winston.info('resubscribing slac');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var slac_socket = clientio.connect(socketURL, options);

    slac_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(slac_socket).emit('slac:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    slac_socket.on('job created', function(data){
      winston.info('got job id');
    });

    slac_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    slac_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });

    slac_socket.on('script error', function(data) {
      winston.warn(data);
      //done();
    });

  });

});
