var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    multihit    = require(__dirname + '/../../app/multihit/multihit.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

var socketURL = 'http://0.0.0.0:5000';

winston.loglevel = 'info';

var options = {
  transports: ['websocket'],
    'force new connection': true
    };

describe('multihit jobrunner', function() {

  var fn = __dirname + '/res/Flu.fasta';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('multihit:spawn',function(stream, params) {
      winston.info('spawning multihit');
      var multihit_job = new multihit.multihit(socket, stream, params);
    });

    socket.on('multihit:resubscribe',function(params) {
      winston.info('resubscribing multihit');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var multihit_socket = clientio.connect(socketURL, options);

    multihit_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(multihit_socket).emit('multihit:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    multihit_socket.on('job created', function(data) {
      winston.info('got job id');
    });

    multihit_socket.on('status update', function(data){
      winston.warn(JSON.stringify(data));
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    multihit_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });

    multihit_socket.on('script error', function(data) {
      winston.warn(data);
      done();
    });

  });

});
