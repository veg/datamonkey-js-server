const spawn = require("child_process").spawn,
  cs = require("../../lib/clientsocket.js"),
  fs = require("fs"),
  config = require("../../lib/config"),
  util = require("util"),
  path = require("path"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  Tail = require("tail").Tail,
  EventEmitter = require("events").EventEmitter,
  JobStatus = require("../../lib/jobstatus.js").JobStatus,
  logger = require("../../lib/logger").logger,
  utilities = require("../../lib/utilities"),
  jobRegistry = require("../../lib/jobregistry.js");

// Use the shared redis v5 client (promise-native, camelCased commands) for
// key-value + publish, and createSubscriber() for the dedicated pub/sub
// connection (redis v5 requires a separate connection for subscriber mode).
const { client, createSubscriber } = require("../../lib/redis-client");

// Small replacement for underscore's _.once — returns a function that invokes
// fn at most once and caches its result.
function once(fn) {
  let called = false,
    result;
  return function () {
    if (!called) {
      called = true;
      result = fn.apply(this, arguments);
    }
    return result;
  };
}

// Promisified fs.readFile (replaces Q.nfcall(fs.readFile, ...)).
const readFileAsync = util.promisify(fs.readFile);

class hivtrace extends hyphyJob {
  constructor(socket, stream, params) {
    super();
    const self = this;

    self.status_states = {
      PENDING: 1,
      RUNNING: 2,
      COMPLETED: 3
    };

    const cluster_output_suffix = "_user.trace.json",
      tn93_json_suffix = "_user.tn93output.json",
      tn93_csv_suffix = "_user.tn93output.csv",
      custom_reference_suffix = "_custom_reference.fas",
      hivtrace_log_suffix = ".hivtrace.log",
      output_fasta_suffix = "_output.fasta";

    self.socket = socket;
    self.stream = stream;
    self.params = params;

    // object specific attributes
    self.python = path.join(__dirname, "../../.python/env/bin/python");
    self.output_dir = path.join(__dirname, "/output/");
    self.qsub_script_name = "hivtrace_submit.sh";
    self.qsub_script = path.join(__dirname, self.qsub_script_name);
    self.hivtrace = path.join(__dirname, "../../.python/env/bin/hivtrace");
    self.custom_reference_fn = "";
    self.type = "hivtrace";
    self.submit_type = config.submit_type || "qsub";

    // parameter attributes
    self.id = params._id;
    self.distance_threshold = params.distance_threshold;
    self.ambiguity_handling = params.ambiguity_handling;
    self.fraction = params.fraction;
    self.reference = params.reference;
    self.filter_edges = params.filter_edges;
    self.reference_strip = params.reference_strip;
    self.min_overlap = params.min_overlap;
    self.status_stack = params.status_stack;
    self.lanl_compare = params.lanl_compare;
    self.prealigned = params.prealigned;
    self.strip_drams = params.strip_drams == "no" ? false : params.strip_drams;

    // parameter-derived attributes.
    // NOTE: self.filepath MUST be set before the Custom-reference block below,
    // which derives custom_reference_fn from it. Previously filepath was assigned
    // after that block, so a Custom reference was written to
    // "undefined_custom_reference.fas" and never found. See #403 follow-up.
    self.filepath = path.join(self.output_dir, self.id);

    if (params.reference == "Custom") {
      self.custom_reference_fn = self.filepath + custom_reference_suffix;
      self.custom_reference = params.custom_reference;
      self.reference = self.custom_reference_fn;
      // Check if reference is custom, and write to a file if so. Log write
      // failures instead of swallowing them — the analysis depends on this file,
      // and a silent failure surfaces later as a confusing "file not found".
      fs.writeFile(self.custom_reference_fn, self.custom_reference, function(err) {
        if (err) {
          logger.error(
            "hivtrace failed to write custom reference file " +
            self.custom_reference_fn + ": " + err.message
          );
        }
      });
    }

    self.status_fn = self.filepath + "_status";
    self.output_cluster_output = self.filepath + cluster_output_suffix;
    self.tn93_stdout = self.filepath + tn93_json_suffix;
    self.tn93_results = self.filepath + tn93_csv_suffix;
    self.tn93_lanl_results = self.filepath + tn93_csv_suffix;
    self.aligned_fasta = self.filepath + output_fasta_suffix;
    self.hivtrace_log = self.filepath + hivtrace_log_suffix;

    const initial_statuses = [];
    (self.status_stack || []).forEach(function(d) {
      initial_statuses.push({ title: d, status: self.status_states.PENDING });
    });

    client.hSet(
      self.id,
      "complete phase status",
      JSON.stringify(initial_statuses)
    );

    // Create parameter string for job submission
    self.params_string = "fn=" +
    self.filepath +
    ",python=" +
    self.python +
    ",hivtrace=" +
    self.hivtrace +
    ",dt=" +
    self.distance_threshold +
    ",ambiguity_handling=" +
    self.ambiguity_handling +
    ",fraction=" +
    self.fraction +
    ",reference=" +
    self.reference +
    ",mo=" +
    self.min_overlap +
    ",filter=" +
    self.filter_edges +
    ",comparelanl=" +
    self.lanl_compare +
    ",reference_strip=" +
    self.reference_strip +
    ",strip_drams=" +
    self.strip_drams +
    ",prealigned=" +
    self.prealigned +
    ",output=" +
    self.output_cluster_output +
    ",hivtrace_log=" +
    self.hivtrace_log +
    ",custom_reference_fn=" +
    self.custom_reference_fn;

    // Prepare qsub params with unique output/error file names
    self.qsub_params = [
      "-l walltime=" + 
    config.hivtrace_walltime + 
    ",nodes=1:ppn=" + 
    config.hivtrace_procs,
      "-q",
      config.qsub_queue,
      "-v",
      self.params_string,
      "-o",
      path.join(self.output_dir, `hivtrace_${self.id}.o`),
      "-e",
      path.join(self.output_dir, `hivtrace_${self.id}.e`),
      self.qsub_script
    ];

    // Prepare sbatch params for SLURM with unique output/error file names
    self.slurm_params = [
      "--ntasks=1",
      "--cpus-per-task=" + config.hivtrace_procs,
      "--time=" + config.hivtrace_walltime,
      "--output=" + path.join(self.output_dir, `hivtrace_${self.id}_%j.out`),
      "--error=" + path.join(self.output_dir, `hivtrace_${self.id}_%j.err`),
      "--export=" + self.params_string,
      self.qsub_script
    ];

    self.spawn();
  }
}

hivtrace.prototype.spawn = function() {
  const self = this;
  self.send_aligned_fasta_once = once(self.sendAlignedFasta.bind(self));
  self.send_tn93_once = once(self.sendtn93.bind(self));

  client.hSet(
    self.id,
    "params",
    typeof self.params === "string" ? self.params : JSON.stringify(self.params)
  );

  // Setup Analysis
  const trace_runner = new HivTraceRunner(self.id, self.hivtrace_log);
  self.trace_runner = trace_runner;
  self.client_socket = new cs.ClientSocket(self.socket, self.id);

  // On status updates, report to datamonkey-js
  trace_runner.on("status update", function(status_update) {
    const index = status_update.index;
    const status = status_update.status;

    try {
      self.onStatusUpdate(status_update, status_update.index);
    } catch (e) {
      self.warn(
        "failed to write status update: " + JSON.stringify(status_update)
      );
    }

    self.log(JSON.stringify(status_update));

    if (index >= 3 && status == 3) {
      self.send_aligned_fasta_once();
      self.send_tn93_once();
    }
  });

  // On errors, report to datamonkey-js
  trace_runner.on("script error", function(error) {
    self.onError(error);
    trace_runner.close();
  });

  // When the analysis completes, return the results to datamonkey.
  trace_runner.on("completed", function() {
    self.onComplete();
    trace_runner.close();
  });

  // Report the torque job id back to datamonkey
  trace_runner.on("job created", function(torque_id) {
    self.onJobCreated(torque_id);
  });

  // Report tn93 summary back to datamonkey
  trace_runner.on("tn93 summary", function(tn93) {
    self.socket.emit("tn93 summary", tn93);
  });

  // See GH #400: register in the central registry instead of adding a
  // per-job process listener. cancel/onError are inherited from hyphyJob.
  jobRegistry.register(self);

  // Release the python_<id> subscriber, the Tail watcher and the status
  // timer (via trace_runner.close), and the registry slot, if the client
  // disconnects before the job reaches a terminal state. See #397, #400.
  self.socket.on("disconnect", function() {
    if (self.trace_runner) self.trace_runner.close();
    jobRegistry.unregister(self.id);
  });

  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);

  // Setup has been completed, run the job with the parameters from datamonkey
  self.stream.pipe(
    fs.createWriteStream(path.join(__dirname, "/output/", self.id))
  );
  
  // Choose the appropriate submission method based on config.submit_type
  if (self.submit_type === "local") {
    // For local submission, create job parameters as environment variables
    const job_params = {};
    self.params_string.split(",").forEach(function(param) {
      const parts = param.split("=");
      if (parts.length === 2) {
        job_params[parts[0]] = parts[1];
      }
    });
    
    trace_runner.submit_local(self.qsub_script, job_params, self.output_dir);
  } else if (self.submit_type === "qsub") {
    trace_runner.submit(self.qsub_params, self.output_dir);
  } else {
    // Assume slurm
    trace_runner.submit_slurm(self.slurm_params, self.output_dir);
  }
};

hivtrace.prototype.onStatusUpdate = function(data, index) {
  const self = this;

  if (!data) {
    return;
  }

  self.current_status = data;

  // get current status stored in redis (redis v5 hGet returns a promise)
  client
    .hGet(self.id, "complete phase status")
    .then(function(entire_status) {
      //msg = {
      //  'type'   : 'status update',
      //  'index'  : phase[0]
      //  'phase'  : phase[1],
      //  'status' : status,
      //  'msg'    : msg
      //}

      const new_status = JSON.parse(entire_status);

      // validate new_status and index
      if (new_status === undefined) {
        logger.warn("hivtrace malformed status update: " + entire_status);
        return;
      }

      if (new_status[data.index] === undefined) {
        logger.warn("hivtrace malformed status update: " + entire_status);
        return;
      }

      new_status[data.index].status = data.status;
      new_status[data.index].index = data.index;

      // update all older statuses as completed
      new_status.slice(0, data.index).forEach(function(d, i) {
        new_status[i].status = self.status_states.COMPLETED;
      });

      new_status[data.index].msg = data.msg ? data.msg : "";

      const status_update = {
        msg: new_status,
        torque_id: self.torque_id
      };

      // Prepare redis packet for delivery
      client.hSet(self.id, "status update", JSON.stringify(data));

      const redis_packet = status_update;
      redis_packet.type = "status update";
      const str_redis_packet = JSON.stringify(status_update);

      // Store packet in redis and publish to channel
      client.hSet(self.id, "complete phase status", JSON.stringify(new_status));

      // Publish updates for all statuses
      client.publish(self.id, str_redis_packet);

      // Log status update on server
      self.log("status update", str_redis_packet);
    })
    .catch(function(err) {
      logger.warn("hivtrace failed to read status from redis: " + err.message);
    });
};

hivtrace.prototype.onComplete = function() {
  const self = this;

  const results_promise = readFileAsync(self.output_cluster_output, "utf-8");
  const promises = [results_promise];

  // Native Promise.allSettled result shape is {status, value/reason}
  // (q's allSettled used {state, value/reason}).
  Promise.allSettled(promises).then(function(results) {
    if (results[0].status == "fulfilled" && results[0].value) {
      // Guard the results parse: a corrupt/partial cluster output must not
      // become an unhandled rejection that leaves the job as a zombie
      // (mirrors clientsocket.js / hyphyjob.js crash guards, #410 / #397).
      let results_data;
      try {
        results_data = JSON.parse(results[0].value);
      } catch (parse_err) {
        self.onError(
          "job completed but results were not valid JSON (" +
            self.output_cluster_output + "): " + parse_err.message
        );
        return;
      }

      const redis_packet = { type: "completed" };
      const str_redis_packet = JSON.stringify(redis_packet);

      // Log that the job has been completed
      self.log("complete", "success");

      self.socket.emit("completed", { results: results_data });

      // Terminal writes + dequeue + unregister via the shared base helper.
      // hivtrace delivers full results over the socket above; we still publish a
      // minimal {type:"completed"} marker on the job channel so the MCP SSE
      // subscriber (#379) receives a completion trigger — it only reads
      // packet.type, so no payload is needed. The browser already handles a
      // 'completed' socket event for other methods, so this is behavior-safe.
      // Single source of truth with hyphyjob.js onComplete.
      self.finalizeCompletion(
        {
          status: "completed",
          results: str_redis_packet
        },
        JSON.stringify({ type: "completed" })
      );
    } else {
      self.onError(
        "job seems to have completed, but no results found: " +
          self.output_cluster_output
      );
    }
  }).catch(function(err) {
    // Safety net: nothing in the .then above should reject, but if it does,
    // surface it through onError instead of Node's unhandledRejection.
    self.onError("hivtrace onComplete failed: " + err.message);
  });
};

hivtrace.prototype.onJobCreated = function(torque_id) {
  const self = this;

  // Build the once()-guarded active_jobs push exactly ONCE per job instance.
  // onJobCreated is bound to the runner's "job created" event, which the
  // scheduler stdout 'data' handlers (and the pub/sub re-emit) can fire more
  // than once; rebuilding the guard each call gave a fresh once() every time,
  // leaking duplicate active_jobs entries. Same fix as hyphyjob.js onJobCreated
  // (this override doesn't inherit the parent's guard — util.inherits).
  if (!self.push_job_once) {
    self.push_active_job = function() {
      client.rPush("active_jobs", self.id);
    };
    self.push_job_once = once(self.push_active_job);
  }
  self.setTorqueParameters(torque_id);
  const redis_packet = torque_id;
  redis_packet.type = "job created";
  const str_redis_packet = JSON.stringify(torque_id);
  self.log("job created", str_redis_packet);
  client.hSet(self.id, "torque_id", str_redis_packet);
  client.publish(self.id, str_redis_packet);
  client.hSet(self.torque_id, "datamonkey_id", self.id);
  client.hSet(self.torque_id, "type", self.type);
  self.push_job_once(self.id);
};

hivtrace.prototype.sendAlignedFasta = function() {
  const self = this;

  const aligned_promise = readFileAsync(self.aligned_fasta);
  const promises = [aligned_promise];

  Promise.allSettled(promises).then(function(results) {
    if (results[0].status == "fulfilled" && results[0].value) {
      self.socket.emit("aligned fasta", { buffer: results[0].value });

      // Log that the job has been completed
      self.warn("sending aligned fasta", self.aligned_fasta, "success");
    } else {
      self.onError(self.aligned_fasta + ": no aligned fasta to send");
    }
  });
};

hivtrace.prototype.sendtn93 = function() {
  const self = this;
  const tn93_promise = readFileAsync(self.tn93_results);
  const promises = [tn93_promise];

  Promise.allSettled(promises).then(function(results) {
    if (results[0].status == "fulfilled" && results[0].value) {
      self.socket.emit("tn93", { buffer: results[0].value });
      // Log that the job has been completed
      self.warn("sending tn93", self.tn93_results, "success");
    } else {
      self.onError(self.tn93_results + ": no tn93 to send");
    }
  });
};

// An object that manages the job submission process
class HivTraceRunner extends EventEmitter {
  constructor(id, hivtrace_log) {
    super();
    const self = this;
    self.python_redis_channel = "python_" + id;
    self.hivtrace_log = hivtrace_log;
    self.last_status_update = "";
    self.submit_type = config.submit_type || "qsub";
    self.subscriber = null;

    // redis v5 pub/sub requires a dedicated (duplicated) connection, and both
    // connect() and subscribe() are async. We kick off the connection here and
    // wire the message listener once connected. The listener is passed directly
    // to subscribe() (there is no more .on("message", ...)). We stash the promise
    // so close() can await teardown after connect, avoiding a leaked subscriber
    // if the job ends before the socket is up (see #397/#400).
    self.subscriber_ready = createSubscriber()
      .then(function(subscriber) {
        self.subscriber = subscriber;

        // If close() ran before the subscriber finished connecting, tear it down
        // immediately instead of leaking it.
        if (self._closed) {
          try {
            subscriber.quit();
          } catch (e) {
            try {
              subscriber.destroy();
            } catch (e2) {}
          }
          return;
        }

        return subscriber.subscribe(self.python_redis_channel, function(message) {
          // Guard the parse: a malformed pub/sub message must not crash the
          // worker (mirrors clientsocket.js subscribe guard, #397 / #410).
          let redis_packet;
          try {
            redis_packet = JSON.parse(message);
          } catch (parse_err) {
            logger.warn(
              "hivtrace ignoring malformed pub/sub message on " +
                self.python_redis_channel + ": " + parse_err.message
            );
            return;
          }
          logger.info(redis_packet);

          if (message != self.last_status_update) {
            self.emit(redis_packet.type, redis_packet);
            self.last_status_update = message;
          }
        });
      })
      .catch(function(err) {
        logger.error(
          "Error setting up HivTrace Redis subscriber: " + err.message
        );
      });
  }

  /**
   * Tears down the dedicated python_<id> Redis subscriber and the status-watcher
   * timer. Idempotent — safe to call from terminal events and socket disconnect.
   * See issue #397.
   */
  close() {
    const self = this;
    if (self._closed) return;
    self._closed = true;

    if (self.metronome_id) clearInterval(self.metronome_id);

    // Stop watching the hivtrace log file (node-tail exposes unwatch()). See #400.
    if (self.tail) {
      try {
        self.tail.unwatch();
      } catch (e) {
        logger.warn("error unwatching hivtrace log tail: " + e);
      }
      self.tail = null;
    }

    logger.info(
      "[REDIS] Closing subscriber for channel " + self.python_redis_channel
    );

    // The subscriber connects asynchronously (redis v5 duplicate + connect).
    // Wait for that to settle so we never leak a subscriber that finished
    // connecting after close() ran, then unsubscribe + quit. The _closed flag
    // set above also makes the connect() handler self-quit if it wins the race.
    const teardown = self.subscriber_ready
      ? Promise.resolve(self.subscriber_ready)
      : Promise.resolve();

    teardown.then(function() {
      if (!self.subscriber) return;
      // In redis v5 the listener was passed to subscribe(); unsubscribe drops it.
      return self.subscriber
        .unsubscribe(self.python_redis_channel)
        .then(function() {
          return self.subscriber.quit();
        })
        .catch(function(err) {
          logger.error(
            "Error closing HivTrace Redis subscriber: " + err.message
          );
          try {
            self.subscriber.destroy();
          } catch (e) {
            logger.error(
              "Error force-ending HivTrace Redis subscriber: " + e.message
            );
          }
        });
    });
  }

  log_publisher() {
    const self = this;

    // read log file (stored on self so close() can stop watching it; GH #400)
    self.tail = new Tail(self.hivtrace_log);

    self.tail.on("line", function(data) {
      logger.debug(data);

      if (data.indexOf("INFO:") != -1) {
        let msg = "";
        // `info` is read in the catch below, so it must be declared before the
        // try (var would hoist; let must be explicit).
        let info;

        // try parsing the message
        try {
          info = data.split("INFO:")[1].split("root:")[1];
          msg = JSON.parse(info);
        } catch (e) {
          logger.warn("error" + e + " for " + info);
        }

        // publish to redis
        client.publish(self.python_redis_channel, JSON.stringify(msg));
      }
    });
  }

  /**
   * Once the job has been scheduled, we need to watch the files that it
   * sends updates to.
   */
  status_watcher() {
    const self = this;
  
    // For local jobs, no status watcher is needed
    if (self.submit_type === "local") {
      return;
    }

    const job_status = new JobStatus(self.torque_id);

    self.metronome_id = job_status.watch(function(error, status) {
      const new_status = status.status;

      if (new_status == "completed" || new_status == "exiting") {
      // check exit code
        clearInterval(self.metronome_id);
        self.emit("completed", "");
      }
    });

  // The python_<id> subscriber message listener is wired at subscribe() time
  // in the constructor (redis v5 passes the listener to subscribe()); there is
  // no more .on("message", ...) here.
  }

  /**
   * Submits a job to TORQUE using qsub command
   * Emit events that are being listened for by the calling class
   */
  submit(qsub_params, cwd) {
    const self = this;

    const qsub_submit = function() {
      const qsub = spawn("qsub", qsub_params, { cwd: cwd });

      qsub.stderr.on("data", function(data) {
      // error when starting job
        self.emit("script error", { error: "" + data });
      });

      qsub.stdout.on("data", function(data) {
        self.torque_id = String(data).replace(/\n$/, "");
        self.emit("job created", { torque_id: self.torque_id });
        logger.info(self.torque_id);
      });

      qsub.on("close", function(code) {
        self.status_watcher();
      });
    };

    // Ensure log directory exists
    utilities.ensureDirectoryExists(path.dirname(self.hivtrace_log));
  
    fs.closeSync(fs.openSync(self.hivtrace_log, "w"));
    qsub_submit();
    self.log_publisher();
  }

  /**
   * Submits a job to SLURM using sbatch command
   * Emit events that are being listened for by the calling class
   */
  submit_slurm(slurm_params, cwd) {
    const self = this;
  
    logger.info("Submitting job to SLURM", slurm_params);

    const sbatch_submit = function() {
      const sbatch = spawn("sbatch", slurm_params, { cwd: cwd });

      sbatch.stderr.on("data", function(data) {
      // error when starting job
        logger.error("SLURM stderr: " + data.toString("utf8"));
        self.emit("script error", { error: "" + data });
      });

      sbatch.stdout.on("data", function(data) {
        logger.info("SLURM stdout: " + data.toString("utf8"));
        // Extract job ID from SLURM output (format: "Submitted batch job 123456")
        self.torque_id = String(data).replace(/\n$/, "").split(" ").pop();
        self.emit("job created", { torque_id: self.torque_id });
        logger.info("SLURM job ID: " + self.torque_id);
      });

      sbatch.on("close", function(code) {
        logger.info("SLURM sbatch process closed with code: " + code);
        self.status_watcher();
      });
    };

    // Ensure log directory exists
    utilities.ensureDirectoryExists(path.dirname(self.hivtrace_log));
  
    fs.closeSync(fs.openSync(self.hivtrace_log, "w"));
    sbatch_submit();
    self.log_publisher();
  }

  /**
   * Submits a job locally without using a job scheduler
   * Emit events that are being listened for by the calling class
   */
  submit_local(script, params, cwd) {
    const self = this;
  
    logger.info("Submitting job locally", script, params);

    const local_submit = function() {
      const proc = spawn(script, { cwd: cwd, env: params });
    
      // Use process id as job identifier
      self.torque_id = "local_" + process.pid;
      self.emit("job created", { torque_id: self.torque_id });

      proc.stderr.on("data", function(data) {
        logger.info("Local job stderr: " + data.toString("utf8"));
      });

      proc.stdout.on("data", function(data) {
        logger.info("Local job stdout: " + data.toString("utf8"));
      });

      proc.on("close", function(code) {
        logger.info("Local job completed with code: " + code);
        self.emit("completed", "");
      });
    };

    // Ensure log directory exists
    utilities.ensureDirectoryExists(path.dirname(self.hivtrace_log));
  
    fs.closeSync(fs.openSync(self.hivtrace_log, "w"));
    local_submit();
    self.log_publisher();
  }
}

exports.hivtrace = hivtrace;
