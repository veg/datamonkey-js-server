/**
 * session.js — loading and running the AxoMEME 2.0 ONNX graph under Node.
 *
 * PORTED FROM DataMonkey 3 (src/lib/services/axomeme/session.js). Every POLICY below is that file's;
 * only the TRANSPORT changed — fetch() became fs.promises.readFile, Web Crypto became node:crypto,
 * and onnxruntime-web became onnxruntime-node. The reasons recorded in the browser version were
 * learned there the hard way, so they are carried over rather than re-derived here.
 *
 * THE LAZY REQUIRE IS LOAD-BEARING — DO NOT HOIST IT TO MODULE SCOPE. `require("onnxruntime-node")`
 * lives inside loadSession()'s async body. That package dlopens ~100 MB of native ONNX Runtime on
 * first require, and lib/mcp/stdio.js is spawned once PER TOOL INVOCATION: hoisting the require
 * would make every MCP call — list_analyses, job_status, the fourteen analyses that have nothing to
 * do with AxoMEME — pay that cost before doing anything at all. This is the Node form of DM3's
 * dynamic import, which exists because a first cut shipped 13.5 MB of ONNX Runtime WASM to every
 * analysis method, and an "is the element absent?" test passed the whole time because the element
 * WAS absent. The bytes were the bug. Requiring this module costs nothing; calling loadSession() is
 * what costs the runtime. (test/load-smoke.js regex-scans every literal require("...") in the tree
 * and checks that each string resolves; it does not pin THIS file's spelling — a computed require
 * would be silently skipped by the scan, not caught. The literal string here simply means
 * load-smoke verifies that "onnxruntime-node", as written, resolves to an installed package.)
 *
 * MEMOISATION. Only the production call is cached, keyed by modelPath + threads, and "production"
 * is decided by an allow-list over the OPTION KEYS: anything beyond modelPath and threads — ort,
 * readFileImpl, verifyHash, any future option — bypasses the cache in both directions. A deny-list
 * naming the unsafe options is exactly what went stale in DM3: it named url/ort/fetchImpl and left
 * `verifyHash` out, so a single loadSession({ verifyHash: false }) could poison the memo with a
 * session that was never checked against VERIFIED_MODEL_SHA256 and then hand it to every later
 * production caller with `sha256: null` — which the runner went on to stamp as the verified hash.
 * A failed load is never memoised either: a transient read error must not disable the feature for
 * the life of the process.
 *
 * INTEGRITY. The artifact's sha256 is pinned in vendor/modelContract.js and verified BEFORE the
 * session is created — a mismatched model is refused, not scored. The contract's conclusions
 * (eval-mode export, `lrt` already decoded, rate heads in log1p space) were read off THAT graph, and
 * a silently swapped model would make all of them wrong while everything continued to run. In the
 * browser this check had to degrade when Web Crypto was missing (non-secure context); node:crypto is
 * always present, so here it is unconditional unless a test explicitly passes verifyHash: false.
 *
 * THE 1.23.2 PIN. onnxruntime-node is pinned exactly rather than caret-ranged: 1.23.2 is the LAST
 * release that ships darwin/x64 bindings, which local development on Intel Macs needs. Production
 * and CI are linux/x64, where the pin costs nothing. DM3 is on onnxruntime-web ^1.27 — that version
 * gap between the two ports is deliberate, and is recorded here so a routine dependency bump does
 * not silently "fix" it and break local dev. (.npmrc's onnxruntime-node-install=skip suppresses only
 * the optional linux CUDA 12 download, not the bindings themselves.)
 *
 * BATCHING. dist_matrix, mds_coords and padding_mask are per-alignment, not per-site — the reference
 * computes them once and `expand`s them across sites. So every codon site of a batch goes through
 * the graph in ONE run, with those three tensors repeated along the batch axis; vendor/assemble.js
 * batch() materialises them that way. The reference driver instead loops one forward pass per site
 * (predict_regression_nexus.py:1345), which for a 441-site alignment is 441 runs of overhead for
 * identical work.
 */

const fs = require("fs");
const path = require("path");
const { createHash } = require("node:crypto");

const {
  INPUT_NAMES,
  VERIFIED_MODEL_SHA256,
} = require("./vendor/modelContract.js");

/** Where the artifact lives. Read from disk on demand, never required, never bundled. */
const MODEL_PATH = path.join(
  __dirname,
  "model",
  "axomeme_2.0_viral_finetuned.onnx"
);

/**
 * Memoised session promises, keyed modelPath + "|" + threads. Empty until the first scoring call.
 * Keyed rather than a single slot because threads is a legitimate production knob, and two callers
 * asking for different thread counts must not silently share one session.
 */
const sessions = new Map();

/** Hex sha256 of a buffer. node:crypto is always available, so this never degrades to null. */
function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function cacheKey(modelPath, threads) {
  return modelPath + "|" + threads;
}

/**
 * Load the ONNX session, requiring the native runtime and reading the model on first call.
 *
 * @param {{modelPath?: string, threads?: number, verifyHash?: boolean, ort?: any,
 *   readFileImpl?: (p: string) => Promise<Buffer|Uint8Array>}} [options]
 *   `ort` and `readFileImpl` are test seams; production passes neither.
 * @returns {Promise<{session: any, ort: any, sha256: string|null, bytes: number}>}
 */
function loadSession(options = {}) {
  const modelPath = options.modelPath || MODEL_PATH;
  const threads = options.threads ?? 1;
  if (!Number.isInteger(threads) || threads < 1) {
    // ORT's own 0 = "all cores" default is deliberately not exposed: this process is one
    // queue/SLURM worker among many on a shared box.
    throw new Error(
      `threads must be a positive integer, got ${JSON.stringify(threads)}`
    );
  }
  const key = cacheKey(modelPath, threads);

  // Cache ONLY the production call, decided by an allow-list over the option KEYS so it cannot go
  // stale: any option other than modelPath/threads — a seam, verifyHash, anything added later —
  // produces a session that is not the one production would get, so it must neither be written to
  // the memo nor read from it.
  const cacheable = Object.keys(options).every(
    (k) => k === "modelPath" || k === "threads"
  );
  // The read-direction bypass, explicitly: a seam call must not be handed a memoised production
  // session any more than it may deposit its own.
  if (cacheable && sessions.has(key)) return sessions.get(key);

  const promise = (async () => {
    const readFile = options.readFileImpl || fs.promises.readFile;

    // The lazy require is the whole point — see the header. Do not hoist it.
    const ort = options.ort || require("onnxruntime-node");

    const buffer = await readFile(modelPath).catch((err) => {
      // Wrap for context but keep the original error reachable: `cause` preserves the full chain,
      // and copying `code` up lets a caller distinguish ENOENT (model not installed) from an I/O
      // failure without parsing the message.
      const wrapped = new Error(
        `AxoMEME model read failed: ${modelPath}: ${err.message}`,
        { cause: err }
      );
      if (err && err.code !== undefined) wrapped.code = err.code;
      throw wrapped;
    });

    // BEFORE InferenceSession.create, not after: refusing to hand a mismatched graph to the runtime
    // at all is the point, and creating it first would burn seconds of graph optimisation only to
    // reach the same throw.
    const sha256 = options.verifyHash === false ? null : sha256Hex(buffer);
    if (sha256 && sha256 !== VERIFIED_MODEL_SHA256) {
      // Refuse rather than score. Every conclusion in modelContract.js was read off the pinned
      // graph; a different one may well be fine, but nothing here knows that, and the failure mode
      // of guessing is silently wrong numbers rather than an error.
      throw new Error(
        `AxoMEME model hash mismatch.\n  expected ${VERIFIED_MODEL_SHA256}\n  got      ${sha256}\n` +
          "The input/output contract was verified against the expected artifact. If the model was " +
          "deliberately updated, re-verify lib/axomeme/vendor/modelContract.js and update " +
          "VERIFIED_MODEL_SHA256 in the same commit."
      );
    }

    // Single-threaded and sequential by default. This process is one queue/SLURM worker among many
    // on a shared box; a runtime that helpfully grabbed every core would be competing with the other
    // jobs, and an AxoMEME batch is already wide enough to keep one core busy.
    const session = await ort.InferenceSession.create(buffer, {
      intraOpNumThreads: threads,
      interOpNumThreads: 1,
      executionMode: "sequential",
      graphOptimizationLevel: "all",
    });

    // The graph must expose exactly what the contract says. A rename upstream would otherwise
    // surface as an opaque runtime error deep inside session.run.
    const missing = INPUT_NAMES.filter((n) => !session.inputNames.includes(n));
    if (missing.length) {
      throw new Error(
        `AxoMEME model is missing expected inputs: ${missing.join(", ")}`
      );
    }

    return { session, ort, sha256, bytes: buffer.byteLength };
  })();

  if (cacheable) {
    sessions.set(key, promise);
    // A failed load must not be memoised as a permanent failure — a transient read error would
    // otherwise disable the feature for the rest of the process's life.
    promise.catch(() => {
      if (sessions.get(key) === promise) sessions.delete(key);
    });
  }
  return promise;
}

/** Drop every memoised session. Tests use this; production has no reason to. */
function resetSession() {
  sessions.clear();
}

/**
 * True once a session is loaded or loading — lets a caller avoid triggering the native runtime load.
 *
 * With no arguments it reports whether ANY session is memoised; passing modelPath and/or threads
 * narrows the question to that cache entry (each omitted argument falls back to the production
 * default: MODEL_PATH, one thread).
 *
 * @param {string} [modelPath] narrow to this model path; default MODEL_PATH
 * @param {number} [threads] narrow to this thread count; default 1
 * @returns {boolean}
 */
function isSessionLoaded(modelPath, threads) {
  if (modelPath === undefined && threads === undefined) {
    return sessions.size > 0;
  }
  return sessions.has(cacheKey(modelPath ?? MODEL_PATH, threads ?? 1));
}

/**
 * Run a batch of sites through the graph.
 *
 * @param {any} session an ONNX InferenceSession
 * @param {object} bundle tensors as produced by vendor/assemble.js batch(), shaped per modelContract
 * @param {any} ort the onnxruntime module (passed in so this stays a pure function, and so nothing
 *   here has to reach for the lazily-required runtime a second time)
 * @returns {Promise<{lrt: Float32Array, alpha: Float32Array, beta_neg: Float32Array,
 *   beta_pos: Float32Array, p_neg: Float32Array}>}
 */
async function runSites(session, bundle, ort) {
  const feeds = {
    msa_codons: new ort.Tensor(
      "int64",
      bundle.msa_codons.data,
      bundle.msa_codons.dims
    ),
    msa_aas: new ort.Tensor("int64", bundle.msa_aas.data, bundle.msa_aas.dims),
    dist_matrix: new ort.Tensor(
      "float32",
      bundle.dist_matrix.data,
      bundle.dist_matrix.dims
    ),
    mds_coords: new ort.Tensor(
      "float32",
      bundle.mds_coords.data,
      bundle.mds_coords.dims
    ),
    padding_mask: new ort.Tensor(
      "bool",
      bundle.padding_mask.data,
      bundle.padding_mask.dims
    ),
  };
  const out = await session.run(feeds);
  return {
    lrt: out.lrt.data,
    alpha: out.alpha.data,
    beta_neg: out.beta_neg.data,
    beta_pos: out.beta_pos.data,
    p_neg: out.p_neg.data,
  };
}

module.exports = {
  MODEL_PATH,
  loadSession,
  resetSession,
  isSessionLoaded,
  runSites,
};
