var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    gard    = require(__dirname + '/../../app/gard/gard.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };



describe('gard jobrunner', function() {

  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('gard:spawn',function(stream, params){
      winston.info('spawning gard');
      var gard_job = new gard.gard(socket, stream, params);
    });

    socket.on('gard:resubscribe',function(params){
      winston.info('resubscribing gard');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var gard_socket = clientio.connect(socketURL, options);

    gard_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(gard_socket).emit('gard:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    gard_socket.on('job created', function(data){
      winston.info('got job id');
    });

    gard_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    gard_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });


    gard_socket.on('script error', function(data) {
      winston.warn(data);
      //done();
    });

  });

});
