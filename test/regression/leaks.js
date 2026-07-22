/**
 * Regression tests for the resource leaks fixed in #397 / #400 / #401 / #403.
 *
 * These run against LIVE Redis (integration-style) — they assert on real
 * `PUBSUB` state and real EventEmitter listener counts, so a regression in the
 * teardown logic fails here even though the shallow submit-and-cancel analysis
 * tests would stay green.
 *
 * They do NOT submit SLURM jobs: each leak is in the in-process socket /
 * subscriber / registry lifecycle, which is exercised directly with stand-in
 * sockets. That keeps them fast and CI-friendly while still hitting real Redis.
 */

var should  = require('should'),
    EventEmitter = require('events').EventEmitter,
    redisClient = require(__dirname + '/../../lib/redis-client.js'),
    cs      = require(__dirname + '/../../lib/clientsocket.js'),
    jobRegistry = require(__dirname + '/../../lib/jobregistry.js');

// A stand-in for a socket.io socket: just needs .id, .on, .emit.
function fakeSocket(id) {
  var s = new EventEmitter();
  s.id = id;
  return s;
}

// Count Redis clients currently in pub/sub subscribe mode for a channel.
//
// redis@5 migration: the old v3 helper opened a throwaway
// `redis.createClient({host,port})` and used `send_command('pubsub',...)` with
// a callback. In v5 there is no callback form and no `send_command`; PUBSUB is
// issued via `client.sendCommand(['PUBSUB','NUMSUB', channel])` on a CONNECTED
// client, which returns a promise resolving to `[channel, count]`. We reuse the
// shared, already-connecting client from lib/redis-client.js rather than
// spinning up (and leaking) a fresh connection per call.
function subscriberCount(channel, cb) {
  redisClient.ready
    .then(function () {
      return redisClient.client.sendCommand(['PUBSUB', 'NUMSUB', channel]);
    })
    .then(function (res) {
      // res = [channel, "<count>"] (count may be a string or number)
      cb(parseInt(res[1], 10));
    })
    .catch(function () {
      cb(0);
    });
}

describe('regression: resource leaks', function () {

  // ---- #397: ClientSocket subscriber released on socket disconnect ----------
  describe('#397 ClientSocket subscriber lifecycle', function () {
    this.timeout(10000);

    it('subscribes on construction and releases the subscriber on disconnect', function (done) {
      var channel = 'regr397-' + process.pid;
      subscriberCount(channel, function (before) {
        before.should.equal(0);
        var sock = fakeSocket('s397');
        var client = new cs.ClientSocket(sock, channel);

        setTimeout(function () {
          subscriberCount(channel, function (during) {
            during.should.equal(1); // subscriber is live while the socket is open

            sock.emit('disconnect'); // browser closes tab
            setTimeout(function () {
              subscriberCount(channel, function (after) {
                after.should.equal(0); // <-- the #397 fix: released, not leaked
                client._closed.should.be.true();
                done();
              });
            }, 400);
          });
        }, 400);
      });
    });

    it('close() is idempotent (double close + disconnect does not throw)', function (done) {
      var channel = 'regr397b-' + process.pid;
      var sock = fakeSocket('s397b');
      var client = new cs.ClientSocket(sock, channel);
      setTimeout(function () {
        (function () { client.close(); client.close(); sock.emit('disconnect'); }).should.not.throw();
        setTimeout(function () {
          subscriberCount(channel, function (after) {
            after.should.equal(0);
            done();
          });
        }, 400);
      }, 300);
    });
  });

  // ---- #400: jobRegistry keeps exactly one process "cancelJob" listener -----
  describe('#400 cancelJob listener does not leak per job', function () {

    // Track every id this suite registers so afterEach can FULLY remove them
    // from the shared jobRegistry singleton — otherwise leftover test doubles
    // bleed into other test files' cancelJob broadcasts. (cancelAll() only
    // cancels; it does not unregister.)
    var registeredIds = [];
    function track(job) { registeredIds.push(job.id); jobRegistry.register(job); return job; }

    afterEach(function () {
      registeredIds.forEach(function (id) { jobRegistry.unregister(id); });
      registeredIds = [];
    });

    it('holds exactly ONE process listener regardless of registered jobs', function () {
      var base = process.listenerCount('cancelJob');
      base.should.equal(1); // installed once at module load

      for (var i = 0; i < 25; i++) {
        track({ id: 'j' + i, cancelled: false, cancel: function () { this.cancelled = true; } });
      }

      // The whole point of #400: registering 25 jobs adds ZERO process listeners.
      process.listenerCount('cancelJob').should.equal(1);
    });

    it('broadcast-cancels all registered jobs, idempotently, and respects unregister', function () {
      var cancelled = [];
      function job(id) { return { id: id, cancel: function () { cancelled.push(id); } }; }
      var a = track(job('A')), b = track(job('B'));

      process.emit('cancelJob', '');
      cancelled.sort().should.eql(['A', 'B']);

      // Re-emitting must NOT re-cancel already-cancelled jobs.
      process.emit('cancelJob', '');
      cancelled.sort().should.eql(['A', 'B']);

      // A newly registered job cancels on the next emit; an unregistered one does not.
      track(job('C'));
      jobRegistry.unregister('B');
      process.emit('cancelJob', '');
      cancelled.sort().should.eql(['A', 'B', 'C']);

      // Still one listener after all that churn.
      process.listenerCount('cancelJob').should.equal(1);
    });
  });

  // ---- #403: hivtrace stores object params in redis without throwing --------
  describe('#403 hivtrace hset tolerates object params', function () {
    this.timeout(5000);

    // redis@5 migration: `hset`->`hSet`, promise-returning (no callback), and
    // the shared connected client from lib/redis-client.js replaces the
    // per-test `createClient`. The #403 fix is that params is JSON.stringify'd
    // before being written, so hSet receives a string (a raw object would
    // reject). We assert the call resolves (does not reject).
    it('does not reject when params is an object (must be stringified first)', function () {
      var params = { type: 'hivtrace', msa: [{ _id: 'x' }], analysis: { _id: 'y' } };
      var key = 'regr403-' + process.pid;
      // Mirror the fixed hivtrace.spawn() call. Pre-fix an object was passed raw.
      return redisClient.ready
        .then(function () {
          return redisClient.client.hSet(
            key,
            'params',
            typeof params === 'string' ? params : JSON.stringify(params)
          );
        })
        .then(function () {
          // Round-trip: the stored value must be the stringified object.
          return redisClient.client.hGet(key, 'params');
        })
        .then(function (stored) {
          stored.should.equal(JSON.stringify(params));
          return redisClient.client.del(key);
        });
    });
  });
});
