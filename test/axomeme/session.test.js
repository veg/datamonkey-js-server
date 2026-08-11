/**
 * session.test.js — the AxoMEME session LOAD POLICY, not inference.
 *
 * Ported from DM3's src/test/axomeme-session.test.js. Dropped: the MODEL_URL "/models/" checks,
 * the fetchImpl 404 case and the wasmPaths concern — all browser-transport specifics with no
 * server equivalent. Kept: every guard, exercised in both directions, because each one of them
 * exists because it was once absent.
 *
 * NOTHING HERE LOADS THE REAL onnxruntime-node. The runtime dlopens ~100 MB of native ONNX
 * Runtime, and the whole design of session.js is that requiring the module must not pay for it.
 * A test file that loaded the runtime to check that the module does not load the runtime would be
 * testing the opposite of the property. Instead a fake ort is either passed as the `ort` seam or,
 * where the production (memoisable) path is what is under test, injected into require.cache at
 * onnxruntime-node's resolved filename so that session.js's lazy `require("onnxruntime-node")`
 * finds it there and never reaches the real package.
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const Module = require("module");

const {
  INPUT_NAMES,
  OUTPUT_SPEC,
  VERIFIED_MODEL_SHA256
} = require("../../lib/axomeme/vendor/modelContract.js");

// --- the reachability probe -----------------------------------------------------------------
// Captured around the require itself, at file-load time, so it is independent of test order.
//
// A DELTA, NOT AN ABSOLUTE ABSENCE CHECK. Mocha loads every file in one process before running
// anything, so predict.test.js — which does load the real runtime in its before() hook — may
// already have put onnxruntime-node in the cache by the time these assertions run. "Is it absent
// now?" would then fail for a reason that has nothing to do with session.js. What this file owns
// is the claim that requiring session.js adds nothing.
const ortCacheEntries = () =>
  Object.keys(require.cache).filter((k) => k.includes("onnxruntime-node")).length;

const ortCacheBefore = ortCacheEntries();
const session = require("../../lib/axomeme/session.js");
const ortCacheAfter = ortCacheEntries();

/** Where require("onnxruntime-node") lands from anywhere in this package. */
const ORT_RESOLVED = require.resolve("onnxruntime-node");

const OUTPUT_NAMES = OUTPUT_SPEC.map((s) => s.name);

/**
 * A stand-in for the onnxruntime-node module that records what it was handed.
 *
 * Port of DM3's `fakeOrt`; its vitest spies become plain arrays since there is no vitest here.
 *
 * @param {string[]} [inputNames] what the fake graph claims to accept — shrink it to drive the
 *   contract check in session.js
 */
function fakeOrt(inputNames = INPUT_NAMES.slice()) {
  const tensors = [];
  const createCalls = [];
  const runCalls = [];

  class Tensor {
    constructor(type, data, dims) {
      this.type = type;
      this.data = data;
      this.dims = dims;
      tensors.push(this);
    }
  }

  const InferenceSession = {
    async create(buffer, sessionOptions) {
      createCalls.push({ byteLength: buffer.byteLength, sessionOptions });
      return {
        inputNames: inputNames.slice(),
        outputNames: OUTPUT_NAMES.slice(),
        async run(feeds) {
          runCalls.push(feeds);
          const batch = feeds.msa_codons.dims[0];
          const out = {};
          for (const name of OUTPUT_NAMES) out[name] = { data: new Float32Array(batch).fill(1) };
          return out;
        }
      };
    }
  };

  return { Tensor, InferenceSession, tensors, createCalls, runCalls };
}

/**
 * Run `fn` with `fake` standing in for onnxruntime-node on the PRODUCTION path.
 *
 * The `ort` option is a seam that deliberately disables memoisation, so it cannot be used to test
 * memoisation. Seeding require.cache instead leaves session.js on the exact branch production
 * takes — zero options, cacheable, real hash verification against the real 3.78 MB artifact —
 * while the native runtime stays untouched.
 */
async function withFakeOrtRequired(fake, fn) {
  const saved = require.cache[ORT_RESOLVED];
  const stub = new Module(ORT_RESOLVED, null);
  stub.filename = ORT_RESOLVED;
  stub.loaded = true;
  stub.exports = fake;
  require.cache[ORT_RESOLVED] = stub;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete require.cache[ORT_RESOLVED];
    else require.cache[ORT_RESOLVED] = saved;
    // A fake session memoised under the production key would otherwise be handed to predict.test.js.
    session.resetSession();
  }
}

describe("axomeme session loading", () => {
  /** Real model bytes, for the seam tests that need the hash check to pass. */
  let modelBytes;

  before(() => {
    modelBytes = fs.readFileSync(session.MODEL_PATH);
  });

  beforeEach(() => session.resetSession());
  afterEach(() => session.resetSession());

  it("requiring the module loads no ONNX runtime", () => {
    // The entire cost discipline in one assertion. lib/mcp/stdio.js is spawned once PER TOOL
    // INVOCATION, so if the require were hoisted out of loadSession()'s body every MCP call —
    // list_analyses, job_status, the analyses that have nothing to do with AxoMEME — would dlopen
    // the native runtime before doing anything. DM3 learned this by shipping 13.5 MB of WASM to
    // every method while an "is the element absent?" test passed the whole time: the bytes were
    // the bug, and no behavioural test could see them.
    assert.equal(ortCacheAfter, ortCacheBefore);
    assert.equal(session.isSessionLoaded(), false);
  });

  it("memoises the production call and never memoises a seam call", async () => {
    const fake = fakeOrt();
    await withFakeOrtRequired(fake, async () => {
      const a = session.loadSession();
      const b = session.loadSession();
      // Identity of the PROMISE, not of the resolved value: two concurrent callers must share one
      // in-flight load rather than racing two graph builds to the same cache slot.
      assert.equal(a, b);
      const loaded = await a;
      assert.equal(session.isSessionLoaded(), true);
      assert.equal(fake.createCalls.length, 1);
      assert.equal(loaded.sha256, VERIFIED_MODEL_SHA256);
      assert.equal(loaded.bytes, modelBytes.byteLength);
    });

    // The negative half. An injected seam must bypass the cache in BOTH directions: it must not
    // read a production session out of it, and it must not write one into it. DM3 got here by
    // inverting a stale allow-list that named url/ort/fetchImpl and forgot verifyHash, so one
    // loadSession({ verifyHash: false }) could poison the memo with a session that had never been
    // checked against VERIFIED_MODEL_SHA256 — which every later production caller then received
    // with sha256: null, and which the runner went on to stamp with the pinned hash anyway.
    const reads = [];
    const readFileImpl = async (p) => {
      reads.push(p);
      return modelBytes;
    };
    const seamOrt = fakeOrt();
    await session.loadSession({ ort: seamOrt, readFileImpl });
    await session.loadSession({ ort: seamOrt, readFileImpl });
    assert.equal(reads.length, 2);
    assert.equal(seamOrt.createCalls.length, 2);
    assert.equal(session.isSessionLoaded(), false);
  });

  it("never memoises a load that skipped hash verification", async () => {
    const fake = fakeOrt();
    await withFakeOrtRequired(fake, async () => {
      // The exact DM3 poisoning shape: verifyHash false as the ONLY non-production option. The
      // require.cache injection keeps everything else on the production path, so the key
      // allow-list is the one thing standing between this call and the memo.
      const skipped = await session.loadSession({ verifyHash: false });
      assert.equal(skipped.sha256, null);
      assert.equal(session.isSessionLoaded(), false);

      // And with the readFile seam alongside, the way tests actually call it.
      await session.loadSession({
        verifyHash: false,
        readFileImpl: async () => modelBytes
      });
      assert.equal(session.isSessionLoaded(), false);

      // A later production call must build its own verified session, not inherit either of the
      // unverified ones — sha256 null here is exactly the poisoned value the DM3 bug handed out.
      const prod = await session.loadSession();
      assert.equal(prod.sha256, VERIFIED_MODEL_SHA256);
      assert.equal(session.isSessionLoaded(), true);
      assert.equal(fake.createCalls.length, 3);
    });
  });

  it("keys the memo by threads and hands each count to the runtime", async () => {
    const fake = fakeOrt();
    await withFakeOrtRequired(fake, async () => {
      // Sequential awaits so createCalls[0]/[1] map to threads 1/2 deterministically.
      const one = session.loadSession();
      await one;
      const two = session.loadSession({ threads: 2 });
      await two;

      // Two DISTINCT entries, both independently memoised: repeat calls return the same promises
      // and the runtime built exactly two graphs.
      assert.notEqual(one, two);
      assert.equal(session.loadSession(), one);
      assert.equal(session.loadSession({ threads: 2 }), two);
      assert.equal(fake.createCalls.length, 2);

      // Zero-arg isSessionLoaded means "any session"; (modelPath, threads) narrows to one entry.
      assert.equal(session.isSessionLoaded(), true);
      assert.equal(session.isSessionLoaded(session.MODEL_PATH, 1), true);
      assert.equal(session.isSessionLoaded(session.MODEL_PATH, 2), true);
      assert.equal(session.isSessionLoaded(session.MODEL_PATH, 3), false);

      // threads is not only a cache key — it reaches InferenceSession.create, pinned to the
      // shared-box policy: one inter-op thread, sequential execution, full graph optimisation.
      const [first, second] = fake.createCalls.map((c) => c.sessionOptions);
      assert.equal(first.intraOpNumThreads, 1);
      assert.equal(second.intraOpNumThreads, 2);
      for (const opts of [first, second]) {
        assert.equal(opts.interOpNumThreads, 1);
        assert.equal(opts.executionMode, "sequential");
        assert.equal(opts.graphOptimizationLevel, "all");
      }
    });
  });

  it("refuses a thread count that is not a positive integer", () => {
    // ORT's 0 = "all cores" default is deliberately not exposed on a shared SLURM box, and a
    // fractional or stringly-typed count must not become a cache key either.
    for (const threads of [0, -1, 1.5, "2", NaN]) {
      assert.throws(
        () => session.loadSession({ threads }),
        /threads must be a positive integer/,
        `threads: ${JSON.stringify(threads)}`
      );
    }
    // Nothing half-built: the throw happens before the memo and before the runtime require.
    assert.equal(session.isSessionLoaded(), false);
  });

  it("a seam call never reads a memoised production session", async () => {
    const fake = fakeOrt();
    await withFakeOrtRequired(fake, async () => {
      // Populate the memo via the production path first...
      const prod = session.loadSession();
      const prodLoaded = await prod;
      assert.equal(session.isSessionLoaded(), true);

      // ...then inject a different runtime through the seam, under the SAME cache key. Without
      // the read-direction bypass this would return the memoised production promise, making the
      // seam useless precisely when a production session already exists.
      const other = fakeOrt();
      const seam = session.loadSession({ ort: other });
      assert.notEqual(seam, prod);
      const seamLoaded = await seam;
      assert.notEqual(seamLoaded.session, prodLoaded.session);
      assert.equal(other.createCalls.length, 1);

      // And the bypass went AROUND the memo, not through it: the production entry is untouched
      // and still what a production caller gets.
      assert.equal(session.loadSession(), prod);
      assert.equal(fake.createCalls.length, 1);
    });
  });

  it("does not memoise a failed load", async () => {
    // Driven through the cache-injected PRODUCTION path on purpose. Failing via readFileImpl would
    // be vacuous — that seam is not cacheable, so "the memo is empty afterwards" would be true
    // whether or not the clean-up existed. A transient failure must not disable AxoMEME for the
    // life of the process.
    const fake = fakeOrt();
    const realCreate = fake.InferenceSession.create;
    let attempt = 0;
    fake.InferenceSession.create = async (...args) => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient runtime failure");
      return realCreate(...args);
    };

    await withFakeOrtRequired(fake, async () => {
      await assert.rejects(session.loadSession(), /transient runtime failure/);
      assert.equal(session.isSessionLoaded(), false);

      const recovered = await session.loadSession();
      assert.equal(recovered.sha256, VERIFIED_MODEL_SHA256);
      assert.equal(session.isSessionLoaded(), true);
      assert.equal(attempt, 2);
    });
  });

  it("refuses a model whose hash does not match the pin", async () => {
    const ort = fakeOrt();
    await assert.rejects(
      session.loadSession({ ort, readFileImpl: async () => Buffer.from([1, 2, 3, 4]) }),
      (err) => {
        assert.match(err.message, /hash mismatch/i);
        // Both halves, from the contract rather than retyped here: a message that shows only what
        // it got leaves the reader grepping for what it wanted.
        assert.ok(err.message.includes(VERIFIED_MODEL_SHA256));
        // And it has to name the constant to edit. "Hash mismatch" alone reads as corruption; the
        // legitimate case is a deliberate model update, and the message is where that is explained.
        assert.ok(err.message.includes("VERIFIED_MODEL_SHA256"));
        return true;
      }
    );
    // Refused BEFORE the graph was built. Verifying after InferenceSession.create would hand the
    // unknown model to the runtime — the exact thing the pin exists to prevent — and burn the
    // graph optimisation to reach the same throw.
    assert.equal(ort.createCalls.length, 0);
  });

  it("refuses a graph that is missing a contract input", async () => {
    const ort = fakeOrt(["msa_codons", "msa_aas", "dist_matrix"]);
    await assert.rejects(
      session.loadSession({
        ort,
        verifyHash: false,
        readFileImpl: async () => Buffer.from([1, 2, 3, 4])
      }),
      (err) => {
        assert.match(err.message, /missing expected inputs/);
        // Names every missing input, not just the first: an upstream rename usually moves more
        // than one, and a one-at-a-time message costs a re-export per name to discover that.
        assert.ok(err.message.includes("mds_coords"));
        assert.ok(err.message.includes("padding_mask"));
        return true;
      }
    );
  });

  it("runSites feeds the contract dtypes and dims, and batches in one run", async () => {
    const ort = fakeOrt();
    const graph = await ort.InferenceSession.create(Buffer.alloc(0), {});

    // B = 2, N = 3, window = 1, mds components = 4 — the shapes assemble.js batch() emits.
    const bundle = {
      msa_codons: { data: BigInt64Array.from([0n, 1n, 2n, 3n, 4n, 5n]), dims: [2, 3, 1] },
      msa_aas: { data: BigInt64Array.from([0n, 1n, 2n, 3n, 4n, 5n]), dims: [2, 3, 1] },
      dist_matrix: { data: new Float32Array(2 * 3 * 3), dims: [2, 3, 3] },
      mds_coords: { data: new Float32Array(2 * 3 * 4), dims: [2, 3, 4] },
      padding_mask: { data: Uint8Array.from([0, 0, 1, 0, 0, 1]), dims: [2, 3] }
    };

    const out = await session.runSites(graph, bundle, ort);

    assert.equal(ort.runCalls.length, 1);
    const feeds = ort.runCalls[0];
    assert.deepEqual(Object.keys(feeds).sort(), INPUT_NAMES.slice().sort());

    // int64 is not decoration: onnxruntime wants BigInt64Array for these, and a Float32Array of
    // the same values is a type error at session.run rather than a silent coercion.
    assert.equal(feeds.msa_codons.type, "int64");
    assert.equal(feeds.msa_aas.type, "int64");
    assert.equal(feeds.dist_matrix.type, "float32");
    assert.equal(feeds.mds_coords.type, "float32");
    assert.equal(feeds.padding_mask.type, "bool");

    for (const name of INPUT_NAMES) {
      assert.deepEqual(feeds[name].dims, bundle[name].dims);
      assert.equal(feeds[name].data, bundle[name].data);
    }

    assert.deepEqual(Object.keys(out).sort(), OUTPUT_NAMES.slice().sort());
    assert.equal(out.lrt.length, 2);

    // ONE run for the whole batch. dist_matrix, mds_coords and padding_mask are per-ALIGNMENT, not
    // per-site — the reference driver loops one forward pass per site
    // (predict_regression_nexus.py:1345), which on a 441-site alignment is 441 runs of overhead
    // for identical work. If runSites ever grows a loop, this is what notices.
    const wide = {
      msa_codons: { data: new BigInt64Array(441 * 2), dims: [441, 2, 1] },
      msa_aas: { data: new BigInt64Array(441 * 2), dims: [441, 2, 1] },
      dist_matrix: { data: new Float32Array(441 * 2 * 2), dims: [441, 2, 2] },
      mds_coords: { data: new Float32Array(441 * 2 * 4), dims: [441, 2, 4] },
      padding_mask: { data: new Uint8Array(441 * 2), dims: [441, 2] }
    };
    const wideOut = await session.runSites(graph, wide, ort);
    assert.equal(ort.runCalls.length, 2);
    assert.equal(wideOut.lrt.length, 441);
  });
});
