const config = require("./lib/config"),
  program = require("commander"),
  path = require("path"),
  absrel = require("./app/absrel/absrel.js"),
  bgm = require("./app/bgm/bgm.js"),
  busted = require("./app/busted/busted.js"),
  difFubar = require("./app/difFubar/difFubar.js"),
  fel = require("./app/fel/fel.js"),
  cfel = require("./app/contrast-fel/cfel.js"),
  flea = require("./app/flea/flea.js"),
  fubar = require("./app/fubar/fubar.js"),
  bstill = require("./app/bstill/bstill.js"),
  fade = require("./app/fade/fade.js"),
  gard = require("./app/gard/gard.js"),
  hivtrace = require("./app/hivtrace/hivtrace.js"),
  meme = require("./app/meme/meme.js"),
  multihit = require("./app/multihit/multihit.js"),
  nrm = require("./app/nrm/nrm.js"),
  prime = require("./app/prime/prime.js"),
  relax = require("./app/relax/relax.js"),
  slac = require("./app/slac/slac.js"),
  job = require("./app/job.js"),
  router = require(path.join(__dirname, "/lib/router.js")),
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

  // HIV-TRACE
  r.route("hivtrace", {
    spawn: function(stream, params) {
      new hivtrace.hivtrace(
        socket,
        stream,
        params.job.analysis
      );
    },

    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    }
  });

  // FLEA
  r.route("flea", {
    spawn: function(stream, params) {
      new flea.flea(socket, stream, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    }
  });

  // PRIME
  r.route("prime", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("PRIME spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("PRIME route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for PRIME constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new prime.prime(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new prime.prime(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // BUSTED
  r.route("busted", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("BUSTED spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("BUSTED route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for BUSTED constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new busted.busted(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new busted.busted(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // RELAX
  r.route("relax", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("RELAX spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("RELAX route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for RELAX constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new relax.relax(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new relax.relax(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // FEL
  r.route("fel", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("FEL spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("FEL route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for FEL constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new fel.fel(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new fel.fel(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // Contrast-FEL
  r.route("cfel", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("Contrast-FEL spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("Contrast-FEL route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for Contrast-FEL constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new cfel.cfel(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new cfel.cfel(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // aBSREL
  r.route("absrel", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("ABSREL spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("ABSREL route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for ABSREL constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new absrel.absrel(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new absrel.absrel(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // MULTIHIT
  r.route("multihit", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("MULTIHIT spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("MULTIHIT route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for MULTIHIT constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new multihit.multihit(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new multihit.multihit(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // NRM
  r.route("nrm", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("NRM spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("NRM route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for NRM constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new nrm.nrm(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new nrm.nrm(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // MEME
  r.route("meme", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("MEME spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("MEME route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for MEME constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new meme.meme(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new meme.meme(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // SLAC
  r.route("slac", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("SLAC spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("SLAC route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for SLAC constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new slac.slac(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new slac.slac(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // GARD
  r.route("gard", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("GARD spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("GARD route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for GARD constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new gard.gard(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new gard.gard(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // FUBAR
  r.route("fubar", {
    spawn: function(stream, params) {
      // Handle both unified format (direct params) and legacy format (params.job)
      const jobParams = params.job || params;
      // Merge tree data into job params (like FEL does)
      var jobWithTree = Object.assign({}, jobParams);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new fubar.fubar(socket, stream, jobWithTree);
    },
    check: function(params) {
      const jobParams = params.job || params;
      jobParams["checkOnly"] = true;
      new fubar.fubar(socket, null, jobParams);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // B-STILL
  r.route("bstill", {
    spawn: function(stream, params) {
      const jobParams = params.job || params;
      var jobWithTree = Object.assign({}, jobParams);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new bstill.bstill(socket, stream, jobWithTree);
    },
    check: function(params) {
      const jobParams = params.job || params;
      jobParams["checkOnly"] = true;
      new bstill.bstill(socket, null, jobParams);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // FADE
  r.route("fade", {
    spawn: function(stream, params) {
      if (!params || !params.job) {
        logger.error("FADE spawn: Invalid parameters received", { params });
        socket.emit("script error", { error: "Invalid job parameters" });
        return;
      }
      logger.info("FADE route spawn called with:", {
        stream_type: typeof stream,
        stream_length: stream ? stream.length : 0,
        stream_preview: stream ? stream.substring(0, 100) : "null",
        params_job: JSON.stringify(params.job),
        params_tree_length: params.tree ? params.tree.length : 0
      });
      // Merge tree data into job params for FADE constructor
      var jobWithTree = Object.assign({}, params.job);
      if (params.tree) {
        jobWithTree.tree = params.tree;
      }
      new fade.fade(socket, stream, jobWithTree);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new fade.fade(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // BGM
  r.route("bgm", {
    spawn: function(stream, params) {
      new bgm.bgm(socket, stream, params.job);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new bgm.bgm(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

  // difFUBAR
  r.route("difFubar", {
    spawn: function(stream, params) {
      new difFubar.difFubar(socket, stream, params.job);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new difFubar.difFubar(socket, null, params.job);
    },
    resubscribe: function(params) {
      new job.resubscribe(socket, params.id);
    },
    cancel: function(params) {
      new job.cancel(socket, params.id);
    }
  });

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
