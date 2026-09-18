// #453 redis-ttl edge tests: error resilience, memory-policy application and
// positiveTtl boundary semantics for lib/redis-ttl.js (redis@3 callback API).
// Run against a live, ISOLATED redis instance (config.json) — never against a
// production instance. Complements test/lifecycle.js (happy-path TTL ranges);
// nothing here duplicates those cases.
var should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  logger = require("../lib/logger.js").logger,
  redisTtl = require("../lib/redis-ttl.js");

var client = redis.createClient({
  host: config.redis_host,
  port: config.redis_port
});

describe("redis-ttl edge cases (#453)", function() {
  this.timeout(10000);

  var suffix = Date.now();
  var seeded = [];
  var original_maxmemory = config.redis_maxmemory;
  var original_maxmemory_policy; // captured in before(), restored in after()

  function seedHash(id, done) {
    seeded.push(id);
    client.hset(id, "status", "queued", done);
  }

  // Build a client, wait until it is usable, then quit it — commands issued
  // afterwards fail in their callback ("connection is already closed"),
  // which is exactly the failure mode the expire/persist helpers must absorb.
  function makeClosedClient(done) {
    var dead = redis.createClient({
      host: config.redis_host,
      port: config.redis_port
    });
    // Without an 'error' listener, a connect failure (isolated redis down)
    // becomes an uncaught 'error' emit with a confusing stack instead of a
    // clean test failure. Post-quit() command errors still reach their
    // per-command callbacks, and the logger spies in the dead-client tests
    // would catch a removed callback, so this listener swallows nothing that
    // the assertions rely on.
    dead.on("error", function() {});
    dead.on("ready", function() {
      dead.quit(function() {
        done(dead);
      });
    });
  }

  // Capture logger.error calls so the dead-client tests can prove the helper
  // actually LOGGED the failure (not merely avoided throwing). Restore before
  // asserting.
  function spyLoggerError() {
    var original = logger.error;
    var spy = {
      messages: [],
      restore: function() {
        logger.error = original;
      }
    };
    logger.error = function(msg) {
      spy.messages.push(String(msg));
    };
    return spy;
  }

  // Wrap the shared client so applyMemoryPolicy's CONFIG SET traffic can be
  // counted — distinguishing "CONFIG SET skipped by the guard" from
  // "attempted and rejected server-side" (both leave maxmemory untouched).
  function makeConfigSpyClient() {
    var calls = [];
    return {
      calls: calls,
      client: {
        config: function() {
          calls.push(Array.prototype.slice.call(arguments));
          client.config.apply(client, arguments);
        }
      }
    };
  }

  before(function(done) {
    client.config("GET", "maxmemory-policy", function(err, reply) {
      should.not.exist(err);
      // redis@3 CONFIG GET reply: [name, value]
      original_maxmemory_policy = reply[1];
      done();
    });
  });

  after(function(done) {
    // Restore the cached-config mutation (other test files share this
    // require-cache object) and undo the maxmemory/maxmemory-policy changes
    // the applyMemoryPolicy tests made on the isolated instance.
    config.redis_maxmemory = original_maxmemory;
    client.config(
      "SET",
      "maxmemory-policy",
      original_maxmemory_policy || "noeviction",
      function() {
        client.config("SET", "maxmemory", "0", function() {
          if (seeded.length === 0) {
            client.quit();
            done();
            return;
          }
          var pending = seeded.length;
          seeded.forEach(function(id) {
            client.del(id, function() {
              if (--pending === 0) {
                client.quit();
                done();
              }
            });
          });
        });
      }
    );
  });

  describe("expire helpers survive a dead client", function() {
    it("expireCompleted on a quit client logs the error and never throws", function(done) {
      var id = "test-453-edge-" + suffix + "-deadclient-completed";
      seedHash(id, function() {
        makeClosedClient(function(dead) {
          var spy = spyLoggerError();
          // Must not throw synchronously, and the async EXPIRE failure must
          // stay inside the helper's error callback (never an uncaught throw).
          (function() {
            redisTtl.expireCompleted(dead, id);
          }).should.not.throw();
          setTimeout(function() {
            spy.restore();
            // the failure was LOGGED, not swallowed
            spy.messages
              .filter(function(m) {
                return m.indexOf("expire failed for " + id) !== -1;
              })
              .length.should.be.above(0);
            // the EXPIRE never reached the server — the key remains TTL-less
            client.ttl(id, function(err, ttl) {
              should.not.exist(err);
              ttl.should.equal(-1);
              done();
            });
          }, 200);
        });
      });
    });

    it("expireTerminal on a quit client logs the error and never throws", function(done) {
      var id = "test-453-edge-" + suffix + "-deadclient-terminal";
      seedHash(id, function() {
        makeClosedClient(function(dead) {
          var spy = spyLoggerError();
          (function() {
            redisTtl.expireTerminal(dead, id, undefined, null, "");
          }).should.not.throw();
          setTimeout(function() {
            spy.restore();
            spy.messages
              .filter(function(m) {
                return m.indexOf("expire failed for " + id) !== -1;
              })
              .length.should.be.above(0);
            client.ttl(id, function(err, ttl) {
              should.not.exist(err);
              ttl.should.equal(-1);
              done();
            });
          }, 200);
        });
      });
    });

    it("expireCompleted with no keys at all is a harmless no-op", function() {
      (function() {
        redisTtl.expireCompleted(client);
        redisTtl.expireTerminal(client);
      }).should.not.throw();
    });
  });

  describe("persistInFlight edge cases", function() {
    it("is a harmless no-op on a key that has no ttl (stays -1)", function(done) {
      var id = "test-453-edge-" + suffix + "-persist-nottl";
      seedHash(id, function() {
        client.ttl(id, function(err, before) {
          should.not.exist(err);
          before.should.equal(-1);
          redisTtl.persistInFlight(client, id);
          setTimeout(function() {
            client.ttl(id, function(err, after) {
              should.not.exist(err);
              after.should.equal(-1);
              client.exists(id, function(err, n) {
                should.not.exist(err);
                n.should.equal(1); // persist must not delete anything
                done();
              });
            });
          }, 100);
        });
      });
    });

    it("skips undefined/null/'' keys without throwing", function(done) {
      var id = "test-453-edge-" + suffix + "-persist-falsy";
      seedHash(id, function() {
        client.expire(id, 600, function() {
          (function() {
            redisTtl.persistInFlight(client, undefined, null, "", id);
          }).should.not.throw();
          setTimeout(function() {
            // the one real key interleaved with the falsy ones was persisted
            client.ttl(id, function(err, ttl) {
              should.not.exist(err);
              ttl.should.equal(-1);
              done();
            });
          }, 100);
        });
      });
    });

    it("on a quit client logs the error and never throws", function(done) {
      var id = "test-453-edge-" + suffix + "-persist-dead";
      seedHash(id, function() {
        client.expire(id, 600, function() {
          makeClosedClient(function(dead) {
            var spy = spyLoggerError();
            (function() {
              redisTtl.persistInFlight(dead, id);
            }).should.not.throw();
            setTimeout(function() {
              spy.restore();
              // the failure was LOGGED, not swallowed
              spy.messages
                .filter(function(m) {
                  return m.indexOf("persist failed for " + id) !== -1;
                })
                .length.should.be.above(0);
              // the PERSIST never reached the server — ttl still pending
              client.ttl(id, function(err, ttl) {
                should.not.exist(err);
                ttl.should.be.above(0);
                done();
              });
            }, 200);
          });
        });
      });
    });
  });

  describe("applyMemoryPolicy", function() {
    it("sets maxmemory-policy to volatile-ttl", function(done) {
      // start from the redis default so we observe the change, not a leftover
      client.config("SET", "maxmemory-policy", "noeviction", function(err) {
        should.not.exist(err);
        redisTtl.applyMemoryPolicy(client);
        setTimeout(function() {
          client.config("GET", "maxmemory-policy", function(err, reply) {
            should.not.exist(err);
            // redis@3 CONFIG GET reply: [name, value]
            reply[1].should.equal("volatile-ttl");
            done();
          });
        }, 200);
      });
    });

    it("sets maxmemory from config.redis_maxmemory ('1gb' -> 1073741824)", function(done) {
      config.redis_maxmemory = "1gb";
      client.config("SET", "maxmemory", "0", function(err) {
        should.not.exist(err);
        redisTtl.applyMemoryPolicy(client);
        setTimeout(function() {
          client.config("GET", "maxmemory", function(err, reply) {
            should.not.exist(err);
            reply[1].should.equal("1073741824");
            config.redis_maxmemory = original_maxmemory;
            done();
          });
        }, 200);
      });
    });

    it("skips the maxmemory CONFIG SET when config.redis_maxmemory is undefined", function(done) {
      config.redis_maxmemory = undefined;
      client.config("SET", "maxmemory", "0", function(err) {
        should.not.exist(err);
        // Spy on client.config: end-state alone can't distinguish "guard
        // skipped the CONFIG SET" from "attempted and rejected server-side"
        // (redis rejects SET maxmemory 'undefined' and leaves 0 either way).
        var spy = makeConfigSpyClient();
        redisTtl.applyMemoryPolicy(spy.client);
        setTimeout(function() {
          spy.calls.length.should.equal(1); // policy only — maxmemory skipped
          spy.calls[0][1].should.equal("maxmemory-policy");
          client.config("GET", "maxmemory", function(err, reply) {
            should.not.exist(err);
            reply[1].should.equal("0"); // untouched
            config.redis_maxmemory = original_maxmemory;
            done();
          });
        }, 200);
      });
    });

    it("skips the maxmemory CONFIG SET when config.redis_maxmemory is ''", function(done) {
      config.redis_maxmemory = "";
      client.config("SET", "maxmemory", "0", function(err) {
        should.not.exist(err);
        var spy = makeConfigSpyClient();
        redisTtl.applyMemoryPolicy(spy.client);
        setTimeout(function() {
          spy.calls.length.should.equal(1); // policy only — maxmemory skipped
          spy.calls[0][1].should.equal("maxmemory-policy");
          client.config("GET", "maxmemory", function(err, reply) {
            should.not.exist(err);
            reply[1].should.equal("0"); // untouched
            config.redis_maxmemory = original_maxmemory;
            done();
          });
        }, 200);
      });
    });

    it("is warn-only when CONFIG SET fails (quit client): no throw, no rejection", function(done) {
      makeClosedClient(function(dead) {
        (function() {
          // fire-and-forget: must return undefined, not a rejecting promise
          var ret = redisTtl.applyMemoryPolicy(dead);
          should.not.exist(ret);
        }).should.not.throw();
        // give the async warn callbacks time to fire — an uncaught throw in
        // them would crash mocha and fail this test
        setTimeout(done, 200);
      });
    });
  });

  describe("positiveTtl boundary values", function() {
    it("falls back on Infinity and NaN (Number.isFinite guard)", function() {
      redisTtl.positiveTtl(Infinity, 86400).should.equal(86400);
      redisTtl.positiveTtl(-Infinity, 86400).should.equal(86400);
      redisTtl.positiveTtl(NaN, 3600).should.equal(3600);
    });

    it("accepts the numeric string '1200' as 1200", function() {
      redisTtl.positiveTtl("1200", 3600).should.equal(1200);
    });

    it("accepts fractional 0.5 (finite && > 0 semantics)", function() {
      // KNOWN HAZARD (documented, not endorsed): positiveTtl passes fractions
      // through, but Redis EXPIRE requires integer seconds — a fractional
      // redis_*_ttl_seconds config would make every terminal EXPIRE fail
      // (error-logged only), silently disabling TTLs. If positiveTtl ever
      // grows a Math.ceil to close this, update these expectations to 1.
      redisTtl.positiveTtl(0.5, 3600).should.equal(0.5);
      redisTtl.positiveTtl("0.5", 3600).should.equal(0.5);
    });

    it("falls back on '' and null (Number() coerces them to 0)", function() {
      redisTtl.positiveTtl("", 3600).should.equal(3600);
      redisTtl.positiveTtl(null, 3600).should.equal(3600);
    });
  });

  describe("exported TTL constants", function() {
    // NOTE: the two derivation checks below are consistency checks only — the
    // worktree config's 86400/3600 equal the fallbacks, so they would pass
    // even against hardcoded constants. The re-require probe after them is
    // what proves the constants are actually computed from config.
    it("COMPLETED_TTL_SECONDS matches positiveTtl(config.redis_result_ttl_seconds, 86400)", function() {
      redisTtl.COMPLETED_TTL_SECONDS.should.equal(
        redisTtl.positiveTtl(config.redis_result_ttl_seconds, 86400)
      );
    });

    it("TERMINAL_TTL_SECONDS matches positiveTtl(config.redis_terminal_ttl_seconds, 3600)", function() {
      redisTtl.TERMINAL_TTL_SECONDS.should.equal(
        redisTtl.positiveTtl(config.redis_terminal_ttl_seconds, 3600)
      );
    });

    it("constants are recomputed from config, not hardcoded (re-require probe)", function() {
      var modPath = require.resolve("../lib/redis-ttl.js");
      var cachedModule = require.cache[modPath];
      var origResult = config.redis_result_ttl_seconds;
      var origTerminal = config.redis_terminal_ttl_seconds;
      try {
        // values deliberately distinct from both the config file's settings
        // and the 86400/3600 fallbacks, so a hardcoded constant (or a
        // positiveTtl that always returns the fallback) cannot sneak through
        config.redis_result_ttl_seconds = 4321;
        config.redis_terminal_ttl_seconds = 987;
        delete require.cache[modPath];
        var fresh = require("../lib/redis-ttl.js");
        fresh.COMPLETED_TTL_SECONDS.should.equal(4321);
        fresh.TERMINAL_TTL_SECONDS.should.equal(987);
      } finally {
        // restore the shared config object and put the ORIGINAL module back
        // into the require cache so every other requirer keeps the instance
        // built from the real config
        config.redis_result_ttl_seconds = origResult;
        config.redis_terminal_ttl_seconds = origTerminal;
        delete require.cache[modPath];
        require.cache[modPath] = cachedModule;
      }
    });

    it("completed retention is not shorter than terminal retention for this config", function() {
      // operational invariant of the #453 design: results outlive failures
      redisTtl.COMPLETED_TTL_SECONDS.should.be.aboveOrEqual(
        redisTtl.TERMINAL_TTL_SECONDS
      );
    });
  });
});
