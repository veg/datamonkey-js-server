"use strict";

/**
 * Minimal vitest-compatible `expect`/`vi` shim for running the ported DM3
 * axomeme unit tests under mocha. Supports the two-arg form
 * `expect(actual, message)` — the message prefixes any failure output.
 *
 * Only the matcher surface actually used by the ported tests is implemented
 * (plus `.not` negation of every matcher).
 */

const assert = require("assert");
const util = require("util");

function show(value) {
  return util.inspect(value, { depth: 4, maxArrayLength: 30, breakLength: 120 });
}

function deepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch (e) {
    return false;
  }
}

function fail(message, detail) {
  const err = new Error(message ? `${message}: ${detail}` : detail);
  err.name = "AssertionError";
  throw err;
}

function buildMatchers(actual, message, negated) {
  function check(pass, positiveDetail, negativeDetail) {
    if (negated ? pass : !pass) {
      fail(message, negated ? negativeDetail : positiveDetail);
    }
  }

  return {
    toBe(expected) {
      check(
        Object.is(actual, expected),
        `expected ${show(actual)} to be ${show(expected)}`,
        `expected ${show(actual)} not to be ${show(expected)}`
      );
    },

    toEqual(expected) {
      check(
        deepEqual(actual, expected),
        `expected ${show(actual)} to deeply equal ${show(expected)}`,
        `expected ${show(actual)} not to deeply equal ${show(expected)}`
      );
    },

    toBeCloseTo(expected, precision) {
      if (precision === undefined) precision = 2;
      let pass;
      if (actual === Infinity && expected === Infinity) pass = true;
      else if (actual === -Infinity && expected === -Infinity) pass = true;
      else pass = Math.abs(actual - expected) < Math.pow(10, -precision) / 2;
      check(
        pass,
        `expected ${show(actual)} to be close to ${show(expected)} (precision ${precision})`,
        `expected ${show(actual)} not to be close to ${show(expected)} (precision ${precision})`
      );
    },

    toMatch(expected) {
      const str = String(actual);
      const pass =
        expected instanceof RegExp ? expected.test(str) : str.includes(String(expected));
      check(
        pass,
        `expected ${show(actual)} to match ${show(expected)}`,
        `expected ${show(actual)} not to match ${show(expected)}`
      );
    },

    toContain(item) {
      let pass;
      if (typeof actual === "string") pass = actual.includes(item);
      else if (actual != null && typeof actual.includes === "function") pass = actual.includes(item);
      else pass = Array.prototype.indexOf.call(actual, item) !== -1;
      check(
        pass,
        `expected ${show(actual)} to contain ${show(item)}`,
        `expected ${show(actual)} not to contain ${show(item)}`
      );
    },

    toHaveLength(expected) {
      const len = actual == null ? undefined : actual.length;
      check(
        len === expected,
        `expected ${show(actual)} to have length ${expected}, got ${len}`,
        `expected ${show(actual)} not to have length ${expected}`
      );
    },

    toBeGreaterThan(expected) {
      check(
        actual > expected,
        `expected ${show(actual)} to be greater than ${show(expected)}`,
        `expected ${show(actual)} not to be greater than ${show(expected)}`
      );
    },

    toBeGreaterThanOrEqual(expected) {
      check(
        actual >= expected,
        `expected ${show(actual)} to be >= ${show(expected)}`,
        `expected ${show(actual)} not to be >= ${show(expected)}`
      );
    },

    toBeLessThan(expected) {
      check(
        actual < expected,
        `expected ${show(actual)} to be less than ${show(expected)}`,
        `expected ${show(actual)} not to be less than ${show(expected)}`
      );
    },

    toBeLessThanOrEqual(expected) {
      check(
        actual <= expected,
        `expected ${show(actual)} to be <= ${show(expected)}`,
        `expected ${show(actual)} not to be <= ${show(expected)}`
      );
    },

    toBeTruthy() {
      check(
        !!actual,
        `expected ${show(actual)} to be truthy`,
        `expected ${show(actual)} not to be truthy`
      );
    },

    toBeDefined() {
      check(
        actual !== undefined,
        "expected value to be defined, got undefined",
        `expected ${show(actual)} to be undefined`
      );
    },

    toBeUndefined() {
      check(
        actual === undefined,
        `expected ${show(actual)} to be undefined`,
        "expected value not to be undefined"
      );
    },

    toHaveProperty(key) {
      const has = actual != null && Object.prototype.hasOwnProperty.call(actual, key);
      check(
        has,
        `expected ${show(actual)} to have property ${key}`,
        `expected ${show(actual)} not to have property ${key}`
      );
    },

    toBeInstanceOf(expected) {
      const name = expected && expected.name ? expected.name : show(expected);
      check(
        actual instanceof expected,
        `expected ${show(actual)} to be an instance of ${name}`,
        `expected ${show(actual)} not to be an instance of ${name}`
      );
    },

    toThrow(expected) {
      if (typeof actual !== "function") {
        fail(message, `toThrow requires a function, got ${show(actual)}`);
      }
      let threw = false;
      let error;
      try {
        actual();
      } catch (e) {
        threw = true;
        error = e;
      }
      let pass;
      if (!threw) {
        pass = false;
      } else if (expected === undefined) {
        pass = true;
      } else {
        const msg =
          error && error.message !== undefined ? String(error.message) : String(error);
        if (expected instanceof RegExp) pass = expected.test(msg);
        else if (typeof expected === "string") pass = msg.includes(expected);
        else pass = false;
      }
      const got = threw ? `threw ${show(error && error.message)}` : "did not throw";
      check(
        pass,
        expected === undefined
          ? `expected function to throw, but it ${got}`
          : `expected function to throw matching ${show(expected)}, but it ${got}`,
        expected === undefined
          ? "expected function not to throw, but it threw"
          : `expected function not to throw matching ${show(expected)}, but it ${got}`
      );
    }
  };
}

function expect(actual, message) {
  const matchers = buildMatchers(actual, message, false);
  matchers.not = buildMatchers(actual, message, true);
  return matchers;
}

function fn(impl) {
  const mockFn = function (...args) {
    mockFn.mock.calls.push(args);
    if (typeof impl === "function") return impl.apply(this, args);
    return undefined;
  };
  mockFn.mock = { calls: [] };
  return mockFn;
}

module.exports = { expect, vi: { fn } };
