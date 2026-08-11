var spawn    = require('child_process').spawn,
    execSync = require('child_process').execSync,
    winston  = require('winston'),
    should   = require('should');

var JobStatus = require(__dirname + '/../lib/jobstatus.js').JobStatus;
var slurmCleanup = require('./helpers/slurm-cleanup');

describe('job status', function() {

  var jobId = null;

  // Ensure any submitted SLURM job is cancelled so it does not occupy the
  // datamonkey partition (jobs have a multi-day walltime). BLOCKING execSync:
  // the previous fire-and-forget `spawn('scancel', [jobId])` was force-killed
  // by `mocha --exit` before it ran, leaking the job onto the live partition.
  afterEach(function() {
    if (jobId) {
      try {
        execSync('scancel ' + jobId, { stdio: 'ignore' });
      } catch (e) {
        // Best-effort: job may already be gone; do not fail the suite.
      }
      slurmCleanup.untrack(jobId);
      jobId = null;
    }
  });

  it('should submit a job and report SLURM status', function(done) {

    this.timeout(20000);

    // Submit a trivial job to SLURM. sbatch prints "Submitted batch job <id>".
    var sbatch = spawn('sbatch', [
      '--partition=datamonkey',
      '--wrap', 'sleep 1'
    ]);

    var out = '';
    var err = '';

    sbatch.stdout.on('data', function(data) { out += data.toString(); });
    sbatch.stderr.on('data', function(data) { err += data.toString(); });

    sbatch.on('close', function(code) {
      out.should.match(/Submitted batch job/, 'sbatch failed: ' + err);

      var match = out.match(/Submitted batch job (\d+)/);
      should.exist(match, 'could not parse job id from: ' + out);
      var id = match[1];
      jobId = id;
      // Register with the root-hook backstop the instant the id is known, so a
      // crash/timeout before afterEach still gets this job cancelled.
      slurmCleanup.track(id);
      winston.info('submitted SLURM job ' + id);

      var job_status = new JobStatus(id);

      // Query status once (the active class is SlurmJobStatus). Do NOT wait for
      // real HyPhy/job completion; a freshly submitted job is queued or running.
      job_status.returnJobStatus(id, function(error, data) {
        should.not.exist(error);
        should.exist(data);
        data.scheduler.should.equal('slurm');
        ['queued', 'running', 'completed', 'exiting'].should.containEql(data.status);
        winston.info('status: ' + data.status);

        // fullJobInfo should return a slurm-tagged info object with a status.
        job_status.fullJobInfo(function(err, val) {
          should.not.exist(err);
          should.exist(val);
          val.scheduler.should.equal('slurm');
          val.should.have.property('status');
          done();
        });
      });
    });

    sbatch.on('error', function(e) {
      done(e);
    });
  });

});
