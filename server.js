const config = require("./config.json"),
  program = require("commander"),
  path = require("path"),
  absrel = require("./app/absrel/absrel.js"),
  bgm = require("./app/bgm/bgm.js"),
  busted = require("./app/busted/busted.js"),
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
  JobQueue = require(path.join(__dirname, "/lib/jobqueue.js")).JobQueue;

//Script parameter for defining port number.
program
  .version("2.1.3")
  .usage("[options] <file ...>")
  .option("-p, --port <n>", "Port number", parseInt)
  .parse(process.argv);


//Assigns port number to variable, if none then refer to config.json
var ioOptions = { "maxHttpBufferSize" : 1e8 };
var ioPort = config.port;

if (program.port) {
  ioPort = program.port;
}

const io = require("socket.io")(ioPort, ioOptions);

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

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
      new busted.busted(socket, stream, params.job);
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
      new relax.relax(socket, stream, params.job);
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
      new fel.fel(socket, stream, params.job);
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
      new cfel.cfel(socket, stream, params.job);
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
      new absrel.absrel(socket, stream, params.job);
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
      new multihit.multihit(socket, stream, params.job);
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
      new nrm.nrm(socket, stream, params.job);
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
      new meme.meme(socket, stream, params.job);
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
      new slac.slac(socket, stream, params.job);
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
      new gard.gard(socket, stream, params.job);
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
      new fubar.fubar(socket, stream, params.job);
    },
    check: function(params) {
      params.job["checkOnly"] = true;
      new fubar.fubar(socket, null, params.job);
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
      new fade.fade(socket, stream, params.job);
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

  // Acknowledge new connection
  socket.emit("connected", { hello: "Ready to serve" });

});



process.setMaxListeners(0);
