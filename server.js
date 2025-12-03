const config = require("./config.json"),
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
  redis = require("redis"),
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

// Configure Redis client with optional password
var redisConfig = {
  host: config.redis_host, 
  port: config.redis_port
};

if (config.redis_password) {
  redisConfig.password = config.redis_password;
}

var client = redis.createClient(redisConfig);

// Add error handler for Redis client
client.on("error", function(err) {
  logger.error("Redis client error: " + err.message);
});

// clear active_jobs list
// TODO: we should do more than just clear the active_jobs list
client.del("active_jobs");

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
      if (callback) callback({ status: 'error', error: 'Missing jobId' });
      return;
    }

    client.hgetall(params.jobId, function(err, jobData) {
      if (err || !jobData) {
        if (callback) callback({ status: 'not_found' });
        return;
      }

      var response = {
        status: jobData.status || 'unknown',
        torque_id: jobData.torque_id
      };

      if (jobData.status === 'completed' && jobData.results) {
        // Results are stored as: {"results":"{ stringified JSON }","type":"completed"}
        // We need to unwrap and parse the inner results string
        try {
          var parsedResults = JSON.parse(jobData.results);
          if (parsedResults.results && typeof parsedResults.results === 'string') {
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
      new prime.prime(socket, stream, params.job);
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



process.setMaxListeners(0);
