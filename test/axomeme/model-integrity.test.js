/**
 * model-integrity.test.js — the AxoMEME .onnx artifact is the one the contract describes.
 *
 * No model load, no onnxruntime, no inference: this file is fs + crypto only, so it runs in
 * milliseconds and fails for exactly one reason — the bytes on disk changed.
 *
 * Everything lib/axomeme/vendor/modelContract.js asserts about the graph (eval-mode export,
 * `lrt` already ordinal-decoded, the rate heads living in log1p space, the TCAG codon order) was
 * read off ONE artifact. A different export may well be fine, but none of those conclusions would
 * have been checked against it, and the failure mode of guessing is plausible numbers computed
 * from the wrong assumptions rather than an error.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("fs");
const path = require("path");

const MODEL = path.join(__dirname, "../../lib/axomeme/model/axomeme_2.0_viral_finetuned.onnx");

/** Measured with `shasum -a 256` on the vendored artifact. */
const EXPECTED_SHA = "3e06b591a060fca996a41c040c2c29f319aa47ca3d3401f4757571b57e6faec6";
const EXPECTED_BYTES = 3782234;

describe("axomeme model artifact integrity", () => {
  it("the model artifact is exactly the pinned size", () => {
    // Cheap and specific: a truncated LFS pointer, a partial checkout or a re-export all show up
    // here first, and with a clearer message than a hash mismatch would give.
    assert.equal(fs.statSync(MODEL).size, EXPECTED_BYTES);
  });

  it("the model artifact hashes to the pinned sha256", () => {
    const sha = crypto.createHash("sha256").update(fs.readFileSync(MODEL)).digest("hex");
    assert.equal(sha, EXPECTED_SHA);
  });

  it("modelContract pins the same hash the artifact has", () => {
    // THE LOAD-BEARING ONE. The other two compare the artifact against a constant in this file;
    // this compares it against the constant session.js actually enforces at load time. Without it,
    // re-vendoring modelContract.js and swapping the .onnx in the same commit would leave the two
    // agreeing with each other and disagreeing with everything that was ever verified — the check
    // would pass while meaning nothing. Both sides have to be moved deliberately, and this test is
    // the third party that notices when only one of them was.
    const contract = require("../../lib/axomeme/vendor/modelContract.js");
    assert.equal(contract.VERIFIED_MODEL_SHA256, EXPECTED_SHA);
  });
});
