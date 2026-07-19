const config = require("./lib/config"),
  program = require("commander"),
  path = require("path"),
  // The 16 standard analyses are required by lib/routes/analysis-routes.js.
  // hivtrace and flea are special-cased and passed into the route registry.
  flea = require("./app/flea/flea.js"),
  hivtrace = require("./app/hivtrace/hivtrace.js"),
  job = require("./app/job.js"),
  router = require(path.join(__dirname, "/lib/router.js")),
  analysisRoutes = require("./lib/routes/analysis-routes.js"),
  JobQueue = require(path.join(__dirname, "/lib/jobqueue.js")).JobQueue,
  logger = require("./lib/logger.js").logger;

//Script parameter for defining port number.
program
  .version("2.8.0")
  .usage("[options] <file ...>")
  .option("-p, --port <n>", "Port number", parseInt)
  .parse(process.argv);


//Assigns port number to variable, if none then refer to config.json
var ioOptions = { 
  "maxHttpBufferSize" : 1e8,
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
};
var ioPort = config.port;

if (program.port) {
  ioPort = program.port;
}

const io = require("socket.io")(ioPort, ioOptions);

// Use the shared redis@5 client factory (see lib/redis-client.js). redis@5 is
// promise-native, so commands return promises and are camelCased
// (del stays del, hgetall -> hGetAll).
var client = require("./lib/redis-client").client;

// clear active_jobs list
// TODO: we should do more than just clear the active_jobs list
client.del("active_jobs").catch(function(err) {
  logger.error("Redis del active_jobs failed: " + err.message);
});

// For every new connection...
io.sockets.on("connection", function(socket) {
  //Routes
  socket.on("job queue", function(jobs) {
    JobQueue(function(jobs) {
      socket.emit("job queue", jobs);
      socket.disconnect();
    });
  });

  // Query job status by ID (for reconnection after page refresh)
  socket.on("job:status", function(params, callback) {
    if (!params || !params.jobId) {
      if (callback) callback({ status: "error", error: "Missing jobId" });
      return;
    }

    // redis@5 hGetAll returns a promise resolving to the hash (an empty object
    // when the key is missing), so treat an empty object as "not found".
    client.hGetAll(params.jobId).then(function(jobData) {
      if (!jobData || Object.keys(jobData).length === 0) {
        if (callback) callback({ status: "not_found" });
        return;
      }

      var response = {
        status: jobData.status || "unknown",
        torque_id: jobData.torque_id
      };

      if (jobData.status === "completed" && jobData.results) {
        // Results are stored as: {"results":"{ stringified JSON }","type":"completed"}
        // We need to unwrap and parse the inner results string
        try {
          var parsedResults = JSON.parse(jobData.results);
          if (parsedResults.results && typeof parsedResults.results === "string") {
            response.results = JSON.parse(parsedResults.results);
          } else {
            response.results = parsedResults.results || parsedResults;
          }
        } catch (e) {
          logger.error("Error parsing job results: " + e.message);
          response.results = jobData.results;
        }
      }

      if (jobData.error) {
        response.error = jobData.error;
      }

      if (callback) callback(response);
    }).catch(function(err) {
      logger.error("Redis hGetAll job:status failed: " + err.message);
      if (callback) callback({ status: "not_found" });
    });
  });

  var r = new router.io(socket);

  // Analysis routes are data-driven — see lib/routes/analysis-routes.js.
  // It reproduces the 16 standard spawn/check/resubscribe/cancel blocks plus
  // the two special analyses (hivtrace, flea). (Phase 3, #410)
  analysisRoutes.registerAnalysisRoutes(r, socket, { hivtrace: hivtrace, flea: flea });

  // Acknowledge new connection
  socket.emit("connected", { hello: "Ready to serve" });

});



// Start MCP server on separate port
var mcp = require("./lib/mcp");
mcp.startMcpServer(config, client);

process.setMaxListeners(20); // bounded; GH #400 removed per-job cancelJob listeners

// -----------------------------------------------------------------------------
// Global process-level error handlers (Phase 0 guardrails, #410)
//
// These are a safety net for errors that escape the normal request/socket
// handling and would otherwise be handled by Node's default behavior.
// They log loudly through the existing winston logger so failures are visible
// in production, rather than being lost to stderr in a PM2 cluster worker.
// -----------------------------------------------------------------------------

// Unhandled promise rejections: log with full error + stack, but do NOT exit.
// A rejected promise leaves the process in a known-enough state to keep serving
// other requests; killing the worker here would be more disruptive than useful.
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection (#410 guardrail)", {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : null,
    promise: String(promise),
  });
});

// Uncaught exceptions: an exception reached the top of the stack, so this worker
// is in an unknown/undefined state. Log it, then exit non-zero after a short
// flush delay so the winston transport can write the record. PM2 will restart
// the worker. We deliberately do NOT swallow this — a corrupted process should
// be replaced, not kept alive serving requests from an unknown state.
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — restarting worker (#410 guardrail)", {
    message: err && err.message,
    stack: err && err.stack,
  });
  // Give the logger a moment to flush before exiting; PM2 handles the restart.
  setTimeout(() => process.exit(1), 500);
});
