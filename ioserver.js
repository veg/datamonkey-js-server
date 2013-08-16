// note, io.listen(<port>) will create a http server for you
var io = require('socket.io').listen(7000)
    spawn_job = require('./hivcluster/spawn_job.js');

io.sockets.on('connection', function (socket) {
  io.sockets.emit('this', { will: 'be received by everyone'});

  socket.on('spawn', function (hiv_cluster_params) {
    console.log(hiv_cluster_params);
    spawn_job.spawnJob(hiv_cluster_params);
  });

  socket.on('disconnect', function () {
    io.sockets.emit('user disconnected');
  });

});
