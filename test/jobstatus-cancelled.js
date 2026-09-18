// #453 jobstatus tests: sacct "CANCELLED by <uid>" normalization.
//
// sacct reports operator-cancelled jobs as "CANCELLED by <uid>" — a state
// string that is NOT a key of the valid_statuses map. Pre-fix, both
// SlurmJobStatus.returnJobStatus and SlurmJobStatus.fullJobInfo fell through
// to their defaults ("queued" / "unknown"), so the watcher polled a cancelled
// job forever and re-fired onJobCreated, whose persistInFlight stripped the
// terminal TTL job.cancel had just set. The fix keeps only the first token
// (.split(" ")[0]) before the map lookup, at TWO independent sites.
//
// Deterministic tests use PATH-shim fake squeue/scontrol/sacct executables so
// exact sacct states can be emitted; the final test uses the REAL scheduler
// (tiny sbatch --wrap job on partition datamonkey, always scancel'd in after)
// to prove live sacct actually emits the "CANCELLED by <uid>" form the shims
// assume. No redis keys are created by this suite.
var fs = require("fs"),
  path = require("path"),
  execSync = require("child_process").execSync,
  should = require("should"),
  config = require("../config.json"),
  JobStatus = require("../lib/jobstatus.js").JobStatus;

var suffix = Date.now();
var shim_root = path.join(__dirname, "shims-jobstatus-" + suffix);
var original_path = process.env.PATH;

// Build a shim directory containing fake squeue/scontrol (exit 1, forcing the
// sacct fallback in returnJobStatus and fullJobInfo respectively) plus a fake
// sacct that prints the given stdout.
function makeShimDir(name, sacct_stdout) {
  var dir = path.join(shim_root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "squeue"), "#!/bin/sh\nexit 1\n", {
    mode: 0o755
  });
  fs.writeFileSync(path.join(dir, "scontrol"), "#!/bin/sh\nexit 1\n", {
    mode: 0o755
  });
  // Quoted heredoc so multi-line output (header + data row) survives intact.
  fs.writeFileSync(
    path.join(dir, "sacct"),
    "#!/bin/sh\ncat <<'SHIMEOF'\n" + sacct_stdout + "\nSHIMEOF\nexit 0\n",
    { mode: 0o755 }
  );
  return dir;
}

// Build a shim directory that fails ONLY the given commands (exit 1) and
// fakes nothing else — the real sacct/squeue/scontrol further down PATH stay
// reachable. Used by the real-scheduler test to force the sacct fallback
// deterministically while still exercising live sacct.
function makeFailShimDir(name, cmds) {
  var dir = path.join(shim_root, name);
  fs.mkdirSync(dir, { recursive: true });
  cmds.forEach(function(cmd) {
    fs.writeFileSync(path.join(dir, cmd), "#!/bin/sh\nexit 1\n", {
      mode: 0o755
    });
  });
  return dir;
}

function useShims(dir) {
  process.env.PATH = dir + ":" + original_path;
}

describe("SLURM jobstatus CANCELLED-by-uid normalization (#453)", function() {
  this.timeout(15000);

  before(function() {
    // These tests exercise the SlurmJobStatus branch; the module picks the
    // class from config.submit_type at require time.
    config.submit_type.should.equal("slurm");
  });

  afterEach(function() {
    process.env.PATH = original_path;
  });

  after(function() {
    fs.rmSync(shim_root, { recursive: true, force: true });
  });

  describe("returnJobStatus (sacct fallback via failing squeue shim)", function() {
    it("maps 'CANCELLED by 1000' to completed, not the pre-fix queued fallthrough", function(done) {
      useShims(
        makeShimDir(
          "rjs-cancelled-by",
          "2026-09-18T10:00:00|2026-09-18T10:00:05|CANCELLED by 1000|999001"
        )
      );
      var js = new JobStatus("999001");
      js.returnJobStatus("999001", function(err, info) {
        should.not.exist(err);
        info.should.have.property("status", "completed");
        // The raw state must be the bare token so downstream consumers see a
        // recognizable SLURM state, not the "CANCELLED by 1000" free text.
        info.should.have.property("raw_status", "CANCELLED");
        info.should.have.property("scheduler", "slurm");
        done();
      });
    });

    it("still maps a bare 'CANCELLED' token to completed (split does not break the plain case)", function(done) {
      useShims(
        makeShimDir(
          "rjs-bare-cancelled",
          "2026-09-18T10:00:00|2026-09-18T10:00:05|CANCELLED|999002"
        )
      );
      var js = new JobStatus("999002");
      js.returnJobStatus("999002", function(err, info) {
        should.not.exist(err);
        info.should.have.property("status", "completed");
        info.should.have.property("raw_status", "CANCELLED");
        done();
      });
    });

    it("falls through to the default 'queued' for an unrecognized state token", function(done) {
      useShims(
        makeShimDir(
          "rjs-unknown-state",
          "2026-09-18T10:00:00|2026-09-18T10:00:05|FROBNICATING|999003"
        )
      );
      var js = new JobStatus("999003");
      js.returnJobStatus("999003", function(err, info) {
        should.not.exist(err);
        info.should.have.property("status", "queued");
        info.should.have.property("raw_status", "FROBNICATING");
        done();
      });
    });

    it("normalizes qualified terminal states other than CANCELLED the same way", function(done) {
      // The split-on-space normalization is generic: any qualifier after the
      // state token must not defeat the map lookup.
      useShims(
        makeShimDir(
          "rjs-failed-qualified",
          "2026-09-18T10:00:00|2026-09-18T10:00:05|FAILED extra-qualifier|999005"
        )
      );
      var js = new JobStatus("999005");
      js.returnJobStatus("999005", function(err, info) {
        should.not.exist(err);
        info.should.have.property("status", "completed");
        info.should.have.property("raw_status", "FAILED");
        done();
      });
    });
  });

  describe("fullJobInfo (sacct fallback via failing scontrol shim)", function() {
    it("maps a State field of 'CANCELLED by 1000' to completed (second normalization site)", function(done) {
      useShims(
        makeShimDir(
          "fji-cancelled-by",
          "JobID|State|ExitCode\n999004|CANCELLED by 1000|0:0"
        )
      );
      var js = new JobStatus("999004");
      js.fullJobInfo(function(err, job_info) {
        should.not.exist(err);
        job_info.should.have.property("status", "completed");
        job_info.should.have.property("state", "CANCELLED by 1000");
        job_info.should.have.property("scheduler", "slurm");
        done();
      });
    });

    it("sets the historical-job default 'unknown' for an unrecognized State token", function(done) {
      useShims(
        makeShimDir(
          "fji-unknown-state",
          "JobID|State|ExitCode\n999006|FROBNICATING|0:0"
        )
      );
      var js = new JobStatus("999006");
      js.fullJobInfo(function(err, job_info) {
        should.not.exist(err);
        job_info.should.have.property("status", "unknown");
        done();
      });
    });

    it("sets 'unknown' when the State field is empty (falsy state_token guard)", function(done) {
      useShims(
        makeShimDir("fji-empty-state", "JobID|State|ExitCode\n999007||0:0")
      );
      var js = new JobStatus("999007");
      js.fullJobInfo(function(err, job_info) {
        should.not.exist(err);
        job_info.should.have.property("status", "unknown");
        done();
      });
    });
  });
});

describe("SLURM jobstatus CANCELLED normalization against the real scheduler (#453)", function() {
  this.timeout(180000);

  var real_job_id = null;

  afterEach(function() {
    process.env.PATH = original_path;
  });

  after(function() {
    // Unconditional cleanup: scancel is a no-op on already-cancelled jobs.
    if (real_job_id) {
      try {
        execSync("scancel " + real_job_id, { stdio: "ignore" });
      } catch (e) {}
    }
    // The first describe's after() already ran; remove the shim dirs this
    // block created under the shared shim_root (rmSync force is idempotent).
    fs.rmSync(shim_root, { recursive: true, force: true });
  });

  it("reports completed for a real scancel'd job once sacct records 'CANCELLED by <uid>'", function(done) {
    // Real PATH for sbatch/scancel/sacct polling. The two JobStatus calls
    // below add fail-only shims (squeue / scontrol exit 1) to route each call
    // deterministically onto its sacct fallback — sacct itself stays real.
    process.env.PATH = original_path;

    var sbatch_out = execSync(
      "sbatch --partition=" +
        (config.slurm_partition || "datamonkey") +
        " --job-name=t453jsc" +
        suffix +
        " --output=/dev/null --wrap='sleep 300'"
    ).toString();
    var m = sbatch_out.match(/Submitted batch job (\d+)/);
    should.exist(m, "sbatch did not return a job id: " + sbatch_out);
    real_job_id = m[1];

    execSync("scancel " + real_job_id, { stdio: "ignore" });

    // Poll real sacct until the CANCELLED record lands in accounting, and
    // assert live sacct really emits the "CANCELLED by <uid>" form that the
    // shim tests above assume.
    var deadline = Date.now() + 120000;
    (function pollSacct() {
      var state = "";
      try {
        state = execSync(
          "sacct -j " +
            real_job_id +
            " --format=State --parsable2 --noheader"
        )
          .toString()
          .split("\n")[0]
          .trim();
      } catch (e) {}

      if (/^CANCELLED/.test(state)) {
        state.should.match(
          /^CANCELLED by \d+$/,
          "live sacct state was '" +
            state +
            "' — expected the 'CANCELLED by <uid>' form"
        );

        // Both sacct fallbacks in lib/jobstatus.js invoke the callback from
        // inside a try block, so an AssertionError thrown inside the callback
        // is CAUGHT by the implementation and converted into a retry/second
        // callback — such an assertion can never fail the test. Guard against
        // that here: capture the callback arguments, then assert on
        // setImmediate, outside the implementation's call stack. finish() is
        // idempotent in case a swallowed error ever does double-invoke.
        var finished = false;
        var finish = function(err) {
          if (finished) return;
          finished = true;
          done(err);
        };
        var assertOutside = function(fn, next) {
          setImmediate(function() {
            try {
              fn();
            } catch (e) {
              return finish(e);
            }
            next();
          });
        };

        // Fail ONLY squeue so returnJobStatus deterministically takes the
        // sacct fallback (real sacct stays on PATH) — otherwise a transient
        // squeue state (e.g. COMPLETING, absent from valid_statuses, or a
        // lingering RUNNING on a busy ctld) short-circuits or misroutes the
        // call and the patched sacct branch is never exercised.
        useShims(makeFailShimDir("real-squeue-fail", ["squeue"]));
        var js = new JobStatus(real_job_id);
        js.returnJobStatus(real_job_id, function(err, info) {
          assertOutside(
            function() {
              should.not.exist(err);
              info.should.have.property("status", "completed");
              info.should.have.property("raw_status", "CANCELLED");
            },
            function() {
              // Fail ONLY scontrol so fullJobInfo deterministically takes its
              // sacct fallback (the second normalization site). Without this,
              // a still-parseable scontrol response validates only the
              // unpatched scontrol branch.
              useShims(makeFailShimDir("real-scontrol-fail", ["scontrol"]));
              var js2 = new JobStatus(real_job_id);
              js2.fullJobInfo(function(err2, job_info) {
                assertOutside(
                  function() {
                    should.not.exist(err2);
                    job_info.should.have.property("status", "completed");
                    // .state only exists on the sacct-fallback path — this
                    // proves the patched branch served the response, and that
                    // live sacct emitted the qualified form end-to-end.
                    job_info.should.have.property("state");
                    job_info.state.should.match(
                      /^CANCELLED by \d+/,
                      "fullJobInfo state was '" +
                        job_info.state +
                        "' — expected the sacct 'CANCELLED by <uid>' form"
                    );
                  },
                  function() {
                    finish();
                  }
                );
              });
            }
          );
        });
      } else if (Date.now() > deadline) {
        done(
          new Error(
            "sacct never reported CANCELLED for job " +
              real_job_id +
              " (last state: '" +
              state +
              "')"
          )
        );
      } else {
        setTimeout(pollSacct, 2000);
      }
    })();
  });
});
