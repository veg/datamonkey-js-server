var spawn_job = require("./spawn_flea.js"),
  fs = require("fs"),
  path = require("path"),
  logger = require("../../lib/logger").logger;

// Pass socket to flea job
var flea = function(socket, stream, params) {

  var log = function(notification) {
    logger.info(["flea", JSON.stringify(notification)].join(" : "));
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
    fs.readFile(params.fn, (err, data) => { 
      socket.emit("progress file", data, { id: params.id });
        socket.once("file saved", function() {
          params.cb();
        });
    });
  });

  var fn = path.join(__dirname, "/output/", params.analysis._id + ".tar");
  flea_analysis.start(fn, socket, params);
  socket.emit("status update", { phase: params.status_stack[0], msg: "" });

};

exports.flea = flea;
