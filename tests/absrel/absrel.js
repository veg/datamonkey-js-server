var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    absrel    = require(__dirname + '/../../app/absrel/absrel.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };



describe('absrel jobrunner', function() {
  var fn = __dirname + '/res/Flu.fasta';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('absrel:spawn',function(stream, params){
      winston.info('spawning absrel');
      var absrel_job = new absrel.absrel(socket, stream, params);
    });

    socket.on('absrel:resubscribe',function(params){
      winston.info('resubscribing absrel');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var absrel_socket = clientio.connect(socketURL, options);

    absrel_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(absrel_socket).emit('absrel:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    absrel_socket.on('job created', function(data){
      winston.info('got job id');
    });

    absrel_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    absrel_socket.on('completed', function(data) {
      winston.warn(data);
      //done();
    });


    absrel_socket.on('script error', function(data) {
      winston.warn(data);
      done();
    });

  });

});
