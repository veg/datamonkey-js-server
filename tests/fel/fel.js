var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    fel    = require(__dirname + '/../../app/fel/fel.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };



describe('fel jobrunner', function() {
  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('fel:spawn',function(stream, params){
      winston.info('spawning fel');
      var fel_job = new fel.fel(socket, stream, params);
    });

    socket.on('fel:resubscribe',function(params){
      winston.info('resubscribing fel');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var fel_socket = clientio.connect(socketURL, options);

    fel_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(fel_socket).emit('fel:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    fel_socket.on('job created', function(data){
      winston.info('got job id');
    });

    fel_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    fel_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });


    fel_socket.on('script error', function(data) {
      winston.warn(data);
      //done();
    });

  });

});
