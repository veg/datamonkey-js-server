/**
 * Full end-to-end integration test: run a real SLAC job to COMPLETION.
 *
 * Unlike the submit-and-cancel analysis tests (which stop as soon as the job
 * reaches the scheduler), this waits for the job to finish and return results.
 * It therefore exercises the entire result-processing tail that no other test
 * reaches — the paths the coverage sweep flagged as integration-only:
 *   - job.js status_watcher poll loop + submit() success path
 *   - hyphyjob.js onStatusUpdate() (progress -> redis 'status update')
 *   - hyphyjob.js onComplete() (read results file -> redis publish -> socket)
 *   - lib/jobstatus.js SlurmJobStatus squeue/scontrol happy paths
 *
 * SLAC on the tiny CD2.nex fixture (10 taxa, 187 codons) schedules instantly
 * on the datamonkey partition and completes in ~15s. A generous timeout
 * absorbs queue-wait variance; an after() hook scancels if anything is left.
 *
 * This test REQUIRES the real SLURM cluster + HyPhy and is intentionally the
 * only completing job in the suite (it costs a real, if brief, allocation).
 */

var fs      = require('fs'),
    path    = require('path'),
    should  = require('should'),
    child   = require('child_process'),
    harness = require(__dirname + '/../helpers/socketharness.js'),
    slac    = require(__dirname + '/../../app/slac/slac.js'),
    job     = require(__dirname + '/../../app/job.js');

var PORT = 5399;

describe('integration: SLAC runs to completion', function () {
  // Compute is ~15s on idle nodes; allow generous slack for queue wait.
  this.timeout(240000);

  var io, client, capturedTorqueId;

  before(function () {
    io = harness.startServer(PORT);
    io.on('connection', function (socket) {
      harness.submitAndExpectStream(io, socket, 'slac:spawn', function (s, stream, params) {
        new slac.slac(s, stream, params);
      });
      socket.on('slac:resubscribe', function (p) { new job.resubscribe(socket, p.id); });
    });
  });

  after(function (done) {
    if (capturedTorqueId) {
      try { child.execSync('scancel ' + capturedTorqueId, { stdio: 'ignore' }); } catch (e) {}
    }
    if (client) client.disconnect();
    if (io) io.close(function () { done(); }); else done();
  });

  it('submits, tracks status, and returns results via the completed event', function (done) {
    var fn = path.join(__dirname, '/../slac/res/CD2.nex');
    var params = JSON.parse(fs.readFileSync(path.join(__dirname, '/../slac/res/params.json')));

    var sawJobCreated = false;
    var sawStatusUpdate = false;
    var finished = false;

    client = harness.connectClient(PORT);

    client.on('connect', function () {
      harness.emitSpawn(client, 'slac:spawn', fn, params);
    });

    client.on('job created', function (data) {
      sawJobCreated = true;
      if (data && data.torque_id) capturedTorqueId = data.torque_id;
    });

    client.on('status update', function () { sawStatusUpdate = true; });

    client.on('completed', function (data) {
      if (finished) return;
      finished = true;
      // The whole point: we reached real completion with real results.
      sawJobCreated.should.be.true();
      should.exist(data);
      should.exist(data.results); // onComplete read the results file and delivered it
      // status_watcher polled at least once before completion.
      sawStatusUpdate.should.be.true();
      done();
    });

    client.on('script error', function (data) {
      if (finished) return;
      finished = true;
      done(new Error('SLAC errored instead of completing: ' + JSON.stringify(data)));
    });
  });
});
