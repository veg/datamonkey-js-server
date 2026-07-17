/**
 * Coverage-gap tests — hivtrace Custom-reference fix + hyphyJob.checkJob().
 *
 *  - hivtrace Custom-reference: regression test for the filepath-before-assignment
 *    bug. self.filepath must be set BEFORE the Custom block so custom_reference_fn
 *    is "<output_dir>/<id>_custom_reference.fas", not "undefined_custom_reference.fas".
 *  - hyphyJob.checkJob(): the reconnect/status-poll entry point (results present ->
 *    onComplete; missing + status -> onStatusUpdate; missing + no status -> onError).
 *
 * No SLURM: hivtrace's spawn() and the job's onComplete/onError/onStatusUpdate are
 * stubbed so nothing is submitted.
 */

var should = require('should'),
    fs     = require('fs'),
    path   = require('path'),
    os     = require('os'),
    hivtraceMod = require(__dirname + '/../../app/hivtrace/hivtrace.js'),
    hyphyMod    = require(__dirname + '/../../app/hyphyjob.js');

function fakeSocket() {
  var EventEmitter = require('events').EventEmitter;
  var s = new EventEmitter();
  s.id = 'cov-sock';
  return s;
}

describe('coverage-gaps: hivtrace Custom-reference + checkJob', function () {

  describe('hivtrace Custom reference filepath (#403 follow-up)', function () {
    var origSpawn, origWriteFile, captured;

    beforeEach(function () {
      // Prevent submission and capture what path the custom reference is written to.
      origSpawn = hivtraceMod.hivtrace.prototype.spawn;
      hivtraceMod.hivtrace.prototype.spawn = function () {};
      origWriteFile = fs.writeFile;
      captured = [];
      fs.writeFile = function (p, data, cb) { captured.push(p); if (cb) cb(null); };
    });
    afterEach(function () {
      hivtraceMod.hivtrace.prototype.spawn = origSpawn;
      fs.writeFile = origWriteFile;
    });

    it('derives custom_reference_fn from a defined filepath (not "undefined_...")', function () {
      var params = {
        _id: 'HT-CUSTOM-1',
        reference: 'Custom',
        custom_reference: '>ref\nACGT\n',
        distance_threshold: 0.015,
        status_stack: []
      };
      var j = new hivtraceMod.hivtrace(fakeSocket(), '>a\nACGT\n', params);

      // The bug produced "undefined_custom_reference.fas". After the fix the
      // filepath is <output_dir>/<id> and the suffix is appended.
      var expected = path.join(j.output_dir, 'HT-CUSTOM-1') + '_custom_reference.fas';
      j.custom_reference_fn.should.equal(expected);
      j.custom_reference_fn.indexOf('undefined').should.equal(-1);
      // fs.writeFile was called with that same (defined) path.
      captured.some(function (p) { return p === expected; }).should.be.true();
    });
  });

  describe('hyphyJob.checkJob()', function () {
    var tmp;
    before(function () { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'covjob-')); });

    function makeJob(overrides) {
      var j = Object.create(hyphyMod.hyphyJob.prototype);
      j.id = 'cov-checkjob';
      j.type = 'absrel';
      j.torque_id = '12345';
      j.log = function () {}; j.warn = function () {};
      j.onCompleteCalled = false; j.onErrorArg = null; j.onStatusArg = null;
      j.onComplete = function () { j.onCompleteCalled = true; };
      j.onError = function (m) { j.onErrorArg = m; };
      j.onStatusUpdate = function (s) { j.onStatusArg = s; };
      Object.keys(overrides || {}).forEach(function (k) { j[k] = overrides[k]; });
      return j;
    }

    it('calls onComplete when a non-empty results file exists', function (done) {
      var rf = path.join(tmp, 'results-present.json');
      fs.writeFileSync(rf, JSON.stringify({ ok: 1 }));
      var j = makeJob({ results_fn: rf });
      j.checkJob();
      setTimeout(function () {
        j.onCompleteCalled.should.be.true();
        done();
      }, 200);
    });

    it('takes the missing-results branch (onError or onStatusUpdate, never onComplete)', function (done) {
      this.timeout(20000);
      // Point results_fn at a nonexistent file and torque_id at a bogus id so
      // JobStatus.returnJobStatus yields an error/no-status -> onError.
      var j = makeJob({ results_fn: path.join(tmp, 'nope-does-not-exist.json'), torque_id: 'BOGUS-DEADBEEF' });
      var settled = false;
      function checkAndFinish() {
        if (settled) return;
        if (j.onErrorArg !== null || j.onStatusArg !== null) {
          settled = true;
          j.onCompleteCalled.should.be.false();
          return done();
        }
      }
      // Wrap the callbacks so we finish as soon as the branch resolves.
      var origErr = j.onError, origStat = j.onStatusUpdate;
      j.onError = function (m) { origErr(m); checkAndFinish(); };
      j.onStatusUpdate = function (s) { origStat(s); checkAndFinish(); };
      j.checkJob();
      // Safety net: if the scheduler poll never calls back, fail explicitly.
      setTimeout(function () {
        if (!settled) { settled = true; done(new Error('checkJob missing-results branch did not resolve')); }
      }, 18000);
    });
  });
});
