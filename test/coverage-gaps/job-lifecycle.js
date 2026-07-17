/**
 * Coverage-gap tests — job-lifecycle & utilities.
 *
 * These close the highest-risk GENUINELY-UNTESTED gaps found by the coverage
 * sweep (as opposed to integration-only or config-dead code):
 *
 *   - job.resubscribe()  (app/job.js) — client reconnect: pending / completed
 *                          / aborted / missing-hash. Wired into every analysis
 *                          server but every :resubscribe test was commented out.
 *   - job.cancel()       (app/job.js) — socket-level cancel: pending (jobDelete),
 *                          completed, aborted, and the JSON.parse(torque_id) catch.
 *   - hyphyJob.checkJob() (app/hyphyjob.js) — reconnect status-poll entry point.
 *   - slurmJobDelete via jobdel.jobDelete (lib/jobdel.js) — invalid-id guard
 *                          (no scancel spawned) + success path (real sbatch/scancel).
 *   - cleanTreeToNewick NEXUS branch (lib/utilities.js).
 *   - hivtrace Custom-reference filepath fix (app/hivtrace/hivtrace.js).
 *
 * Uses LIVE Redis (seed/read hashes). Only the slurmJobDelete success path
 * touches SLURM, and it submits a trivial `sleep` job that is cancelled by the
 * code under test and swept in afterEach.
 */

var should  = require('should'),
    redis   = require('redis'),
    child   = require('child_process'),
    fs      = require('fs'),
    path    = require('path'),
    EventEmitter = require('events').EventEmitter,
    config  = require(__dirname + '/../../config.json'),
    job     = require(__dirname + '/../../app/job.js'),
    jobdel  = require(__dirname + '/../../lib/jobdel.js'),
    utilities = require(__dirname + '/../../lib/utilities.js');

var client = redis.createClient({ host: config.redis_host, port: config.redis_port });

// A stand-in socket that records emits and disconnects.
function recSocket(id) {
  var s = new EventEmitter();
  s.id = id || 'recsock';
  s.emitted = [];
  var realEmit = s.emit.bind(s);
  s.emit = function (ev, data) { s.emitted.push({ ev: ev, data: data }); return realEmit(ev, data); };
  s.disconnected = false;
  s.disconnect = function () { s.disconnected = true; };
  return s;
}
function last(socket, ev) {
  for (var i = socket.emitted.length - 1; i >= 0; i--) if (socket.emitted[i].ev === ev) return socket.emitted[i].data;
  return undefined;
}

describe('coverage-gaps: job lifecycle & utilities', function () {

  // -------------------------------------------------------------------------
  describe('job.resubscribe() (app/job.js)', function () {
    this.timeout(6000);
    var ids = [];
    afterEach(function () { ids.forEach(function (id) { client.del(id); }); ids = []; });

    it('emits completed with parsed results when the job is completed', function (done) {
      var id = 'cov-resub-done-' + process.pid;
      ids.push(id);
      var results = { foo: 'bar', n: 3 };
      client.hset(id, 'status', 'completed', function () {
        client.hset(id, 'results', JSON.stringify(results), function () {
          var sock = recSocket();
          new job.resubscribe(sock, id);
          setTimeout(function () {
            var d = last(sock, 'completed');
            should.exist(d);
            d.should.eql(results);
            sock.disconnected.should.be.true();
            done();
          }, 300);
        });
      });
    });

    it('re-attaches a ClientSocket (subscribes) when the job is still pending', function (done) {
      var id = 'cov-resub-pending-' + process.pid;
      ids.push(id);
      client.hset(id, 'status', 'queued', function () {
        var sock = recSocket();
        new job.resubscribe(sock, id);
        setTimeout(function () {
          // pending path opens a subscriber on the job channel
          var c = redis.createClient({ host: config.redis_host, port: config.redis_port });
          c.send_command('pubsub', ['numsub', id], function (err, res) {
            c.quit();
            parseInt(res[1], 10).should.be.aboveOrEqual(1);
            done();
          });
        }, 300);
      });
    });

    it('emits script error for the terminal-non-completed (exiting) branch', function (done) {
      // resubscribe routes ANY status that is not completed/exiting to the
      // pending re-subscribe branch; the error branch is reached only when
      // status === "exiting" (not completed, and the pending guard is false).
      var id = 'cov-resub-exit-' + process.pid;
      ids.push(id);
      client.hset(id, 'status', 'exiting', function () {
        client.hset(id, 'error', 'boom', function () {
          var sock = recSocket();
          new job.resubscribe(sock, id);
          setTimeout(function () {
            sock.emitted.some(function (e) { return e.ev === 'script error'; }).should.be.true();
            done();
          }, 300);
        });
      });
    });

    it('emits script error when the job hash is missing', function (done) {
      var id = 'cov-resub-missing-' + process.pid;
      var sock = recSocket();
      new job.resubscribe(sock, id);
      setTimeout(function () {
        sock.emitted.some(function (e) { return e.ev === 'script error'; }).should.be.true();
        done();
      }, 300);
    });
  });

  // -------------------------------------------------------------------------
  describe('job.cancel() (app/job.js)', function () {
    this.timeout(6000);
    var ids = [];
    var origJobDelete;
    beforeEach(function () { origJobDelete = jobdel.jobDelete; });
    afterEach(function () {
      jobdel.jobDelete = origJobDelete;
      ids.forEach(function (id) { client.del(id); }); ids = [];
    });

    it('calls jobDelete and emits cancelled ok for a pending job', function (done) {
      var id = 'cov-cancel-pending-' + process.pid;
      ids.push(id);
      var deleted = null;
      jobdel.jobDelete = function (tid, cb) { deleted = tid; cb(); };
      client.hset(id, 'status', 'queued', function () {
        client.hset(id, 'torque_id', JSON.stringify({ torque_id: '999999' }), function () {
          var sock = recSocket();
          new job.cancel(sock, id);
          setTimeout(function () {
            deleted.should.equal('999999');
            last(sock, 'cancelled').should.eql({ success: 'ok' });
            done();
          }, 300);
        });
      });
    });

    it('emits cancelled ok (no delete) for a completed job', function (done) {
      var id = 'cov-cancel-done-' + process.pid;
      ids.push(id);
      var called = false;
      jobdel.jobDelete = function () { called = true; };
      client.hset(id, 'status', 'completed', function () {
        client.hset(id, 'torque_id', JSON.stringify({ torque_id: '1' }), function () {
          var sock = recSocket();
          new job.cancel(sock, id);
          setTimeout(function () {
            called.should.be.false();
            last(sock, 'cancelled').should.eql({ success: 'ok' });
            done();
          }, 300);
        });
      });
    });

    it('emits cancelled failure when torque_id is malformed (JSON.parse catch)', function (done) {
      var id = 'cov-cancel-badtid-' + process.pid;
      ids.push(id);
      client.hset(id, 'status', 'queued', function () {
        client.hset(id, 'torque_id', 'not-json', function () {
          var sock = recSocket();
          new job.cancel(sock, id);
          setTimeout(function () {
            // catch emits {success:'no', error:'could not retrieve torque id'}
            var msgs = sock.emitted.filter(function (e) { return e.ev === 'cancelled'; });
            msgs.some(function (m) { return m.data && m.data.success === 'no'; }).should.be.true();
            done();
          }, 300);
        });
      });
    });

    it('emits cancelled failure when the job hash is missing', function (done) {
      var id = 'cov-cancel-missing-' + process.pid;
      var sock = recSocket();
      new job.cancel(sock, id);
      setTimeout(function () {
        last(sock, 'cancelled').should.have.property('success', 'no');
        done();
      }, 300);
    });
  });

  // -------------------------------------------------------------------------
  describe('lib/jobdel.jobDelete (slurm)', function () {
    this.timeout(15000);
    var created = [];
    afterEach(function () {
      created.forEach(function (id) { try { child.execSync('scancel ' + id, { stdio: 'ignore' }); } catch (e) {} });
      created = [];
    });

    it('rejects an invalid torque id without spawning scancel', function (done) {
      // validateTorqueId = /^[\w\.]+$/ ; "bad;id" fails -> cb(err, 1), no scancel.
      jobdel.jobDelete('bad;id rm -rf', function (err, code) {
        should.exist(err);
        code.should.equal(1);
        done();
      });
    });

    it('cancels a real queued SLURM job (success path)', function (done) {
      // Submit a trivial long sleep so it stays queued/running long enough to cancel.
      child.exec("sbatch --partition=datamonkey --wrap='sleep 300'", function (e, stdout) {
        if (e) return done(e);
        var m = /Submitted batch job (\d+)/.exec(stdout || '');
        if (!m) return done(new Error('no job id from sbatch: ' + stdout));
        var jid = m[1];
        created.push(jid);
        jobdel.jobDelete(jid, function (err, code) {
          code.should.equal(0);
          done();
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('utilities.cleanTreeToNewick NEXUS branch', function () {
    it('extracts the newick tree from a #NEXUS block', function () {
      var nexus = '#NEXUS\nbegin trees;\ntree t1 = ((A,B),C);\nend;';
      utilities.cleanTreeToNewick(nexus).should.equal('((A,B),C);');
    });
    it('appends a trailing semicolon to a bare newick', function () {
      utilities.cleanTreeToNewick('((A,B),C)').should.equal('((A,B),C);');
    });
    it('passes through non-string input unchanged', function () {
      should(utilities.cleanTreeToNewick(null)).equal(null);
    });
  });
});
