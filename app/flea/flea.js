var spawn_job = require("./spawn_flea.js"),
  fs = require("fs"),
  path = require("path"),
  winston = require("winston"),
  ss = require("socket.io-stream");

// Pass socket to flea job
var flea = function(socket, stream, params) {

  var log = function(notification) {
    winston.info(["flea", JSON.stringify(notification)].join(" : "));
  };

  // Setup Analysis
  var flea_analysis = new spawn_job.FleaRunner();

  // On status updates, report to datamonkey-js
  flea_analysis.on("status update", function(status_update) {
    socket.emit("status update", status_update);
    log(status_update);
  });

  // On errors, report to datamonkey-js
  flea_analysis.on("script error", function(error) {
    socket.emit("script error", error);
    socket.disconnect();
  });

  // When the analysis completes, return the results to datamonkey.
  flea_analysis.on("completed", function(results) {
    // Send trace and graph information
    socket.emit("completed", results);
    //socket.disconnect();
  });

  // Report the torque job id back to datamonkey
  flea_analysis.on("job created", function(torque_id) {
    // Send trace and graph information
    socket.emit("job created", torque_id);
  });

  // Send file
  flea_analysis.on("progress file", function(params) {
    var stream = ss.createStream();
    ss(socket).emit("progress file", stream, { id: params.id });
    fs.createReadStream(params.fn).pipe(stream);
    socket.once("file saved", function() {
      params.cb();
    });
  });

  var fn = path.join(__dirname, "/output/", params.analysis._id + ".tar");

  stream.pipe(fs.createWriteStream(fn));

  socket.emit("status update", { phase: params.status_stack[0], msg: "" });

  stream.on("end", function(err) {
    if (err) throw err;
    // Pass filename in as opposed to generating it in spawn_flea
    flea_analysis.start(fn, socket, params);
  });

};

exports.flea = flea;
