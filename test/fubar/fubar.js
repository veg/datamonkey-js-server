var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    fubar    = require(__dirname + '/../../app/fubar/fubar.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };



describe('fubar jobrunner', function() {
  var fn = __dirname + '/res/CD2.nex';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('fubar:spawn',function(stream, params){
      winston.info('spawning fubar');
      var fubar_job = new fubar.fubar(socket, stream, params);
    });

    socket.on('fubar:resubscribe',function(params){
      winston.info('resubscribing fubar');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var fubar_socket = clientio.connect(socketURL, options);

    fubar_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(fubar_socket).emit('fubar:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    fubar_socket.on('job created', function(data){
      winston.info('got job id');
    });

    fubar_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    fubar_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });


    fubar_socket.on('script error', function(data) {
      winston.warn(data);
      //done();
    });

  });

});
