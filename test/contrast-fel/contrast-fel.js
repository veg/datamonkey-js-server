var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    cfel    = require(__dirname + '/../../app/contrast-fel/cfel.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

var socketURL = 'http://0.0.0.0:5000';

winston.loglevel = 'info';

var options = {
  transports: ['websocket'],
    'force new connection': true
    };

describe('cfel jobrunner', function() {

  var fn = __dirname + '/res/Flu.fasta';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('cfel:spawn',function(stream, params) {
      winston.info('spawning cfel');
      var cfel_job = new cfel.cfel(socket, stream, params);
    });

    socket.on('cfel:resubscribe',function(params) {
      winston.info('resubscribing cfel');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var cfel_socket = clientio.connect(socketURL, options);

    cfel_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(cfel_socket).emit('cfel:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    cfel_socket.on('job created', function(data) {
      winston.info('got job id');
    });

    cfel_socket.on('status update', function(data){
      winston.warn(JSON.stringify(data));
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    cfel_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });

    cfel_socket.on('script error', function(data) {
      winston.warn(data);
      done();
    });

  });

});
