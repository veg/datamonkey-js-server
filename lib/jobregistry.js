// Central registry of live jobs so a single process-level "cancelJob"
// listener can broadcast-cancel all active jobs without leaking one
// listener per job (see GH #400).
var _ = require("underscore");

var activeJobs = new Map(); // id -> job instance

function register(job) {
  if (job && job.id) activeJobs.set(job.id, job);
}

function unregister(id) {
  if (id) activeJobs.delete(id);
}

function cancelAll() {
  activeJobs.forEach(function(job) {
    // Bind once per job so repeated cancelJob events cancel at most once.
    job.cancel_broadcast_once =
      job.cancel_broadcast_once || _.once(job.cancel.bind(job));
    job.cancel_broadcast_once();
  });
}

// Install the SINGLE permanent listener exactly once (module is cached by Node).
process.on("cancelJob", cancelAll);

module.exports = { register: register, unregister: unregister, cancelAll: cancelAll };
