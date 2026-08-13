/**
 * Terminal packets must carry the job id (#209).
 *
 * WHY. A client holds ONE socket and can have SEVERAL jobs running on it. The
 * "status update" packet has always carried `id`, so progress could be routed to
 * the right job — but "completed" and "script error" did not, so the two packets
 * that actually end a job were the two a client could not attribute. The client
 * worked around it with a heuristic (datamonkey3#208); this makes that dead code.
 *
 * WHAT IS PINNED. Every terminal publish site, exercised through the real
 * prototype methods rather than by reading the source: the shared
 * hyphyJob.onComplete / onError, plus the three bespoke analyses that build
 * their own completion packet (gard, difFubar, hivtrace). Those three are the
 * reason this file enumerates sites instead of trusting one chokepoint — they
 * bypass hyphyjob's onComplete entirely, so a fix applied in only one place
 * would leave concurrent GARD/difFUBAR/HIV-TRACE jobs unroutable.
 *
 * HOW. lib/redis-client exports a single shared `client` object, and every
 * analysis module holds a reference to that same object. Replacing its
 * `publish` here is therefore observed by the code under test, with no
 * module-cache surgery and no live pub/sub.
 */

var should = require("should"),
  fs = require("fs"),
  os = require("os"),
  path = require("path"),
  redisClient = require(__dirname + "/../../lib/redis-client.js"),
  hyphyJob = require(__dirname + "/../../app/hyphyjob.js").hyphyJob;

var client = redisClient.client;

describe("#209 terminal packets carry the job id", function () {
  var published, originals, tmpdir;

  beforeEach(function () {
    published = [];
    originals = {
      publish: client.publish,
      hSet: client.hSet,
      lRem: client.lRem,
      expire: client.expire
    };
    client.publish = function (channel, message) {
      published.push({ channel: channel, message: message });
      return Promise.resolve(1);
    };
    // Terminal writes run inside a Promise.all alongside publish; stub them so
    // the test neither touches nor depends on a live Redis.
    client.hSet = function () { return Promise.resolve(1); };
    client.lRem = function () { return Promise.resolve(1); };
    client.expire = function () { return Promise.resolve(1); };
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "dm-209-"));
  });

  afterEach(function () {
    Object.keys(originals).forEach(function (k) {
      client[k] = originals[k];
    });
    try {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    } catch (e) {
      /* best-effort cleanup */
    }
  });

  /** The minimum shape the terminal paths touch. */
  function fakeJob(id, extra) {
    var self = {
      id: id,
      type: "fel",
      torque_id: "9999",
      results_fn: path.join(tmpdir, id + ".results.json"),
      std_err: path.join(tmpdir, id + ".err"),
      std_out: path.join(tmpdir, id + ".out"),
      progress_fn: path.join(tmpdir, id + ".progress"),
      socket: { emit: function () {}, id: "sock-1" },
      log: function () {},
      warn: function () {},
      finalizeCompletion: hyphyJob.prototype.finalizeCompletion
    };
    return Object.assign(self, extra || {});
  }

  function lastPacket() {
    published.length.should.be.above(0, "nothing was published");
    return JSON.parse(published[published.length - 1].message);
  }

  function settle() {
    // The publish happens inside a promise chain; yield past it.
    return new Promise(function (resolve) { setTimeout(resolve, 50); });
  }

  it("completed carries id, and it matches the channel", async function () {
    var self = fakeJob("job-completed-1");
    fs.writeFileSync(self.results_fn, JSON.stringify({ MLE: {} }));
    hyphyJob.prototype.onComplete.call(self);
    await settle();
    var packet = lastPacket();
    packet.type.should.equal("completed");
    packet.id.should.equal("job-completed-1");
    // The id must agree with the channel it was published on, or routing by it
    // would be worse than the heuristic it replaces.
    published[published.length - 1].channel.should.equal("job-completed-1");
    should.exist(packet.results);
  });

  it("script error carries id", async function () {
    var self = fakeJob("job-error-1");
    hyphyJob.prototype.onError.call(self, "boom");
    await settle();
    var packet = lastPacket();
    packet.type.should.equal("script error");
    packet.id.should.equal("job-error-1");
    packet.error.should.equal("boom");
  });

  it("status update still carries id (the packet that always did)", async function () {
    var self = fakeJob("job-status-1", { current_status: "", stime: 1, ctime: 2 });
    hyphyJob.prototype.onStatusUpdate.call(self, { status: "RUNNING" });
    await settle();
    var packet = lastPacket();
    packet.type.should.equal("status update");
    packet.id.should.equal("job-status-1");
  });

  // The bespoke analyses build their own completion packet and never reach
  // hyphyjob's onComplete, so each needs its own witness.
  describe("bespoke analyses", function () {
    it("gard completion carries id", function () {
      var src = fs.readFileSync(
        path.join(__dirname, "../../app/gard/gard.js"),
        "utf8"
      );
      // gard's onComplete is deeply entangled with its file post-processing, so
      // this asserts the packet is stamped at construction rather than
      // re-implementing the whole method here.
      src.should.match(
        /redis_packet\.type = "completed";\s*\n\s*\/\/[^\n]*\n\s*redis_packet\.id = self\.id;/,
        "gard.js must stamp redis_packet.id on its completed packet"
      );
    });

    it("difFubar completion carries id", function () {
      var src = fs.readFileSync(
        path.join(__dirname, "../../app/difFubar/difFubar.js"),
        "utf8"
      );
      src.should.match(
        /redis_packet\.type = "completed";\s*\n\s*\/\/[^\n]*\n\s*redis_packet\.id = self\.id;/,
        "difFubar.js must stamp redis_packet.id on its completed packet"
      );
    });

    it("hivtrace completion and status packets carry id", function () {
      var src = fs.readFileSync(
        path.join(__dirname, "../../app/hivtrace/hivtrace.js"),
        "utf8"
      );
      // Both the socket-side packet and the minimal marker published for the
      // MCP SSE subscriber.
      src.should.match(
        /const redis_packet = \{ type: "completed", id: self\.id \}/,
        "hivtrace.js must stamp id on its completed packet"
      );
      src.should.match(
        /JSON\.stringify\(\{ type: "completed", id: self\.id \}\)/,
        "hivtrace.js must stamp id on the published completion marker"
      );
      src.should.match(
        /torque_id: self\.torque_id,\s*\n(\s*\/\/[^\n]*\n)*\s*id: self\.id/,
        "hivtrace.js must stamp id on its status update packet"
      );
    });
  });
});
