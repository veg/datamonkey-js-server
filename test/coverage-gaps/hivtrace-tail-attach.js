// tail 2.x hardening (#493): the Tail constructor throws ENOENT if the
// tailed file does not exist, and the hivtrace pipeline creates its log
// asynchronously after spawn. log_publisher() must wait for the file,
// attach once it appears, and close() must cancel a pending retry.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { HivTraceRunner } = require("../../app/hivtrace/hivtrace.js");

describe("hivtrace log_publisher tail attach (#493)", function() {
  this.timeout(10000);

  let runner, logf;

  afterEach(function() {
    if (runner) runner.close();
    runner = null;
    try {
      fs.unlinkSync(logf);
    } catch (e) {
      /* already gone */
    }
  });

  it("does not throw when the log file is missing and schedules a retry", function() {
    logf = path.join(os.tmpdir(), "ht-tail-missing-" + Date.now() + ".log");
    runner = new HivTraceRunner("tailtest-" + Date.now(), logf);
    runner.log_publisher();
    assert.strictEqual(!!runner.tail, false, "must not attach to a missing file");
    assert.ok(runner.tail_retry, "must schedule an attach retry");
  });

  it("attaches once the log file appears and clears the retry", function(done) {
    logf = path.join(os.tmpdir(), "ht-tail-appears-" + Date.now() + ".log");
    runner = new HivTraceRunner("tailtest-" + Date.now(), logf);
    runner.log_publisher();
    setTimeout(function() {
      fs.writeFileSync(logf, "");
    }, 1100);
    setTimeout(function() {
      assert.ok(runner.tail, "must attach after the file appears");
      assert.strictEqual(runner.tail_retry, null, "retry timer must be cleared");
      done();
    }, 3200);
  });

  it("attaches immediately when the log file already exists", function() {
    logf = path.join(os.tmpdir(), "ht-tail-exists-" + Date.now() + ".log");
    fs.writeFileSync(logf, "");
    runner = new HivTraceRunner("tailtest-" + Date.now(), logf);
    runner.log_publisher();
    assert.ok(runner.tail, "must attach synchronously to an existing file");
    assert.strictEqual(runner.tail_retry, null);
  });

  it("close() cancels a pending attach retry", function() {
    logf = path.join(os.tmpdir(), "ht-tail-close-" + Date.now() + ".log");
    runner = new HivTraceRunner("tailtest-" + Date.now(), logf);
    runner.log_publisher();
    assert.ok(runner.tail_retry);
    runner.close();
    assert.strictEqual(runner.tail_retry, null, "close() must clear the retry timer");
    assert.ok(!runner.tail, "no tail must be attached");
    runner = null;
  });
});
