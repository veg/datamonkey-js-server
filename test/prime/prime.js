var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    prime     = require(__dirname + '/../../app/prime/prime.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };



describe('prime jobrunner', function() {
  var fn = __dirname + '/res/595a5dfd0483ab9a7959e731';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('prime:spawn',function(stream, params){
      winston.info('spawning prime');
      var prime_job = new prime.prime(socket, stream, params);
    });

    socket.on('prime:resubscribe',function(params){
      winston.info('resubscribing prime');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var prime_socket = clientio.connect(socketURL, options);

    prime_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(prime_socket).emit('prime:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    prime_socket.on('job created', function(data){
      winston.info('got job id');
    });

    prime_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    prime_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });


    prime_socket.on('script error', function(data) {
      winston.warn(data);
      //done();
    });

  });

});
