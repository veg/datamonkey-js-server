// #220: the "script error" packet must carry the actionable HyPhy failure in
// a compact `details` field, extracted from the job's log files. The wrapper
// scripts pipe HyPhy stdout into the PROGRESS file, so assertion blocks live
// there — scheduler stderr usually holds only srun/qsub kill noise.
const assert = require("assert");
const { extractHyphyError } = require("../../app/hyphyjob.js");

const GARD_PROGRESS_TAIL = [
  "Analysis Description",
  "--------------------",
  ">Loaded a nucleotide multiple sequence alignment with **80** sequences",
  ">Minimum size of a partition is set to be 157 sites",
  "",
  "Master node received an error:## ASSERTION FAILED",
  "The alignment is too short to permit c-AIC based model comparison. " +
    "Need at least 321 sites for 80 sequences to fit a two-partiton model."
].join("\n");

const SRUN_NOISE = [
  "srun: Job step aborted: Waiting up to 62 seconds for job step to finish.",
  "slurmstepd-node1: error: *** STEP 1332393.0 ON node1 CANCELLED ***",
  "srun: error: node1: task 0: Exited with exit code 1"
].join("\n");

describe("extractHyphyError (#220)", function() {
  it("extracts the assertion block from the progress tail over srun stderr noise", function() {
    const details = extractHyphyError(GARD_PROGRESS_TAIL, SRUN_NOISE, "");
    assert.ok(details.startsWith("Master node received an error"));
    assert.ok(details.includes("## ASSERTION FAILED"));
    assert.ok(details.includes("alignment is too short"));
    assert.ok(!details.includes("Analysis Description"), "must not include boilerplate before the block");
  });

  it("finds an ASSERTION block in stderr when progress has none", function() {
    const details = extractHyphyError("plain progress text", "## ASSERTION FAILED\nBad input", "");
    assert.ok(details.startsWith("## ASSERTION FAILED"));
  });

  it("uses the LAST marker occurrence", function() {
    const src = "Error: first\nlots of text\nError: the real terminal failure";
    assert.strictEqual(extractHyphyError(src, "", ""), "Error: the real terminal failure");
  });

  it("falls back to a stderr tail when no marker exists anywhere", function() {
    const details = extractHyphyError("no markers here", "segfault at 0xdeadbeef", "");
    assert.strictEqual(details, "segfault at 0xdeadbeef");
  });

  it("falls back to the progress tail when stderr is empty", function() {
    const details = extractHyphyError("last progress line", "", undefined);
    assert.strictEqual(details, "last progress line");
  });

  it("returns empty string when nothing is available", function() {
    assert.strictEqual(extractHyphyError(undefined, undefined, undefined), "");
    assert.strictEqual(extractHyphyError("", "   ", ""), "");
  });

  it("caps the extracted block at 4KB", function() {
    const details = extractHyphyError("## ASSERTION FAILED\n" + "x".repeat(10000), "", "");
    assert.ok(details.length <= 4096);
  });
});
