// note, io.listen(<port>) will create a http server for ,ou
var config = require('./config.js'),
    io = require('socket.io').listen(config.port),
    spawn_job = require('./hivcluster/spawn_job.js');
    
io.sockets.on('connection', function (socket) {
  io.sockets.emit('this', { will: 'be received by everyone'});

  socket.emit('connected', { hello: 'world' });

  socket.on('spawn', function (hiv_cluster_params) {

    var cluster_analysis = new spawn_job.DoHivClusterAnalysis();

    cluster_analysis.on('status update', function(msg) {
      socket.emit('status update', msg);
    });

    cluster_analysis.on('completed', function(msg) {
      socket.emit('completed', msg);
    });

    cluster_analysis.run(hiv_cluster_params);

  });

  socket.on('disconnect', function () {
    io.sockets.emit('user disconnected');
  });


});
