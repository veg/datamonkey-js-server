var fs        = require('fs'),
    should    = require('should'),
    winston   = require('winston'),
    clientio  = require('socket.io-client');
    io        = require('socket.io').listen(5000);
    meme    = require(__dirname + '/../../app/meme/meme.js'),
    job       = require(__dirname + '/../../app/job.js'),
    ss        = require('socket.io-stream');

//TODO: retrieve socket from config
var socketURL = 'http://0.0.0.0:5000';

var options ={
  transports: ['websocket'],
    'force new connection': true
    };



describe('meme jobrunner', function() {
  var fn = __dirname + '/res/Flu.fasta';
  var params_file = __dirname + '/res/params.json';

  io.sockets.on('connection', function (socket) {
    ss(socket).on('meme:spawn',function(stream, params){
      winston.info('spawning meme');
      var meme_job = new meme.meme(socket, stream, params);
    });

    socket.on('meme:resubscribe',function(params){
      winston.info('resubscribing meme');
      new job.resubscribe(socket, params.id);
    });

  });

  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var meme_socket = clientio.connect(socketURL, options);

    meme_socket.on('connect', function(data){
      winston.info('connected to server');
      var stream = ss.createStream();
      ss(meme_socket).emit('meme:spawn', stream, params);
      fs.createReadStream(fn).pipe(stream);
    });

    meme_socket.on('job created', function(data){
      winston.info('got job id');
    });

    meme_socket.on('status update', function(data){
      winston.info('job successfully completed');
      process.emit('cancelJob', '');
    });

    meme_socket.on('completed', function(data) {
      winston.warn(data);
      done();
    });


    meme_socket.on('script error', function(data) {
      winston.warn(data);
      //done();
    });

  });

});
