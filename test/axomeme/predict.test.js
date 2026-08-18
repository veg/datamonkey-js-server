/**
 * predict.test.js — the AxoMEME prediction core end to end, against the real ONNX graph.
 *
 * This is the one file here that loads onnxruntime-node and the real 3.78 MB artifact. It is
 * still fast (measured ~1 s for two full predictions including the native runtime's first
 * require), because the fixture is 8 taxa x 30 codons and every site of a batch goes through the
 * graph in one run.
 *
 * The numbers asserted below were MEASURED against this artifact with these fixtures, not derived
 * from the model's documentation. That is the point: DM3 and this server must return the same
 * JSON for the same inputs, and a divergence in either port is a silently different answer rather
 * than an error. Anything that changes these values — a re-vendored preprocessing module, a
 * different tokenizer order, a new .onnx — should have to come here and say so.
 *
 * DELIBERATELY NOT TESTED: sequence-name validation. predict.js exports SAFE_SEQUENCE_NAME for the
 * SLURM job descriptor and the MCP tool to share, but predict itself must not grow name
 * validation — it scores whatever it is handed, and rejecting a comma in a FASTA header is the
 * descriptor's job, at the boundary where the name reaches a shell. The omission is intentional;
 * please do not "fix" it by adding a case here.
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { predictAxomeme } = require("../../lib/axomeme/predict.js");
const sessionModule = require("../../lib/axomeme/session.js");
const { VERIFIED_MODEL_SHA256 } = require("../../lib/axomeme/vendor/modelContract.js");

const fasta = fs.readFileSync(path.join(__dirname, "res/small.fasta"), "utf8");
const nwk = fs.readFileSync(path.join(__dirname, "res/small.nwk"), "utf8");

/** Same topology, branch lengths stripped. Inline rather than a fixture — it is a negative case. */
const TOPOLOGY_ONLY =
  "((((HIV1_B_JRCSF,HIV1_B_JRCSF_2),(HIV1_C_ZA_01,HIV1_C_ZA_02))," +
  "(HIV1_A_UG_01,HIV1_A_UG_02)),(SIVcpz_TAN1,SIVcpz_TAN2));";

/** 0-based sites 4, 9, 14, 19, 24 are constant across all eight taxa by construction. */
const INVARIANT_SITES = [5, 10, 15, 20, 25];

/**
 * v1-viral exports ONE head (`lrt`), so dS / dN+ / p are not emitted AT ALL — not emitted as zero.
 * A zero in a rate column reads as "no synonymous change", which would be a measurement the model
 * never made. The absence is the contract, which is why it is pinned as an exact key set.
 */
const SITE_FIELDS = [
  "call",
  "isVariable",
  "logLrt",
  "lrt",
  "percentile",
  "refAa",
  "refCodon",
  "site",
  "zScore"
];

/** Heads the retired 2.0 export had. Nothing downstream may resurrect them as zeros. */
const RETIRED_FIELDS = ["alphaDs", "betaPosDn", "pPos"];

describe("axomeme prediction", function () {
  // Generous only for a cold native-runtime load on a busy box; the work itself is ~1 s.
  this.timeout(60000);

  let result;
  let zscoreResult;

  before(async () => {
    // One prediction per calling mode, shared by every assertion below. Re-running per `it` would
    // multiply the only expensive part of this file by the number of tests for no added coverage.
    result = await predictAxomeme({ alignmentText: fasta, treeText: nwk });
    zscoreResult = await predictAxomeme({
      alignmentText: fasta,
      treeText: nwk,
      callMode: "zscore"
    });
  });

  after(async () => {
    // Hand the graph back rather than waiting for GC, and empty the memo so nothing else in the
    // process inherits a session it did not ask for.
    if (sessionModule.isSessionLoaded()) {
      const { session } = await sessionModule.loadSession();
      if (typeof session.release === "function") await session.release();
    }
    sessionModule.resetSession();

    // --- workaround for an onnxruntime-node teardown defect, not for anything in this repo ---
    //
    // Once ANY InferenceSession has been created, onnxruntime-node 1.23.2 cannot survive
    // process.exit(). libc's exit() runs the runtime's static destructors in an order they do not
    // tolerate and the process aborts with
    //   libc++abi: terminating due to uncaught exception ... mutex lock failed: Invalid argument
    // exiting 1. Reduced to three lines with no code from this repo involved:
    //   node -e 'const o=require("onnxruntime-node");(async()=>{
    //     await o.InferenceSession.create(fs.readFileSync(model)); process.exit(0);})()'
    // Requiring the package is fine; releasing the session first does not help; a delay before the
    // exit does not help. Node's NORMAL exit path unwinds cleanly — `mocha` without `--exit` runs
    // this file and exits 0. Reproduced on darwin/x64, which is why it matters here: the 1.23.2 pin
    // exists precisely because it is the last release shipping darwin/x64 bindings for local dev.
    //
    // So the suite reports 19 passing and then dies with status 1, which reads as a failing test
    // run when nothing failed. The fix is to stop forcing the exit: set the code mocha asked for
    // and let Node unwind on its own. That is safe here because nothing in this suite leaves a
    // handle open — which is exactly why the run without `--exit` already terminates in ~2 s. The
    // unref'd watchdog covers the case where that stops being true: an unref'd timer cannot itself
    // hold the loop open, so it only ever fires if something else did, and hanging CI would be a
    // worse outcome than the abort.
    //
    // Scoped to the case that actually breaks — if the native runtime never loaded, --exit is
    // perfectly safe and is left alone. Remove all of this when onnxruntime-node is unpinned.
    const ortLoaded = Object.keys(require.cache).some((k) => k.includes("onnxruntime-node"));
    if (!ortLoaded) return;
    const forceExit = process.exit.bind(process);
    process.exit = (code) => {
      if (code !== undefined) process.exitCode = code;
      setTimeout(() => forceExit(process.exitCode ?? 0), 10000).unref();
    };
  });

  it("returns exactly the documented result envelope", () => {
    // Exact key equality, not "has these keys". This shape is a contract two codebases implement;
    // adding a field should be a deliberate edit to this line, which is what pinning it buys.
    assert.deepEqual(Object.keys(result).sort(), [
      "isSurrogate",
      "method",
      "modelSha256",
      "modelVersion",
      "sites",
      "summary",
      "surrogateFor"
    ]);
    assert.equal(result.method, "AxoMEME");
    // Load-bearing for every consumer: these are PREDICTIONS of what MEME would report, in seconds
    // instead of hours, and they are wrong sometimes in ways a fitted model is not. A UI that drops
    // these two fields is presenting a guess as a result.
    assert.equal(result.isSurrogate, true);
    assert.equal(result.surrogateFor, "MEME");
    assert.equal(typeof result.modelVersion, "string");
    assert.ok(result.modelVersion.length > 0);
  });

  it("summarises the alignment the way the pipeline saw it", () => {
    assert.equal(result.sites.length, 30);
    assert.equal(result.summary.totalSites, 30);
    assert.equal(result.summary.variableSites, 25);
    assert.equal(result.summary.speciesUsed, 8);
    assert.equal(result.summary.speciesInAlignment, 8);
    // The reference sequence defines the site count and the reported codons; picking a different
    // one silently renumbers every site in the output.
    assert.equal(result.summary.referenceSequence, "HIV1_B_JRCSF");
    // All eight tips are in the tree, so species order came from the tree rather than from a
    // fallback over FASTA order — the model reads a distance matrix indexed by that order.
    assert.equal(result.summary.matchedFromTree, true);
    // Every branch length in the fixture is strictly positive, so nothing should have been clamped.
    // A nonzero count here means the patristic matrix was repaired before the model saw it.
    assert.equal(result.summary.clampedDistances, 0);
    assert.equal(result.summary.duplicateSelections, 0);
    assert.deepEqual(result.summary.treeWarnings, []);
  });

  it("gives every site row the same nine fields, numbered 1..30", () => {
    result.sites.forEach((row, i) => {
      assert.deepEqual(Object.keys(row).sort(), SITE_FIELDS, `row ${i + 1} fields`);
      assert.equal(row.site, i + 1);
      assert.equal(row.refCodon.length, 3, `row ${i + 1} refCodon`);
    });
    assert.equal(result.sites[0].refCodon, "ATG");
    assert.equal(result.sites[0].refAa, "M");
  });

  it("emits no retired rate field, on any row", () => {
    // The 2.0 heads are gone with the model. Asserting their ABSENCE across every row (not just
    // the shape of row 1) is what stops a well-meaning "fill it with 0 so the column renders"
    // from coming back: hyphy-scope 1.11.0 makes those columns conditional on the data precisely
    // so that absent means absent.
    for (const row of result.sites) {
      for (const field of RETIRED_FIELDS) {
        assert.ok(!(field in row), `site ${row.site} still carries ${field}`);
      }
    }
  });

  it("zeroes invariant sites instead of scoring them", () => {
    // The reference zeroes these BEFORE consulting the model (predict_regression_nexus.py:1394),
    // so whatever the network said at a site where every sequence codes the same amino acid is
    // discarded. THE ZEROS MEAN "NOT APPLICABLE", NOT "NO SELECTION" — a renderer that plots them
    // as measured zeros invents five data points per alignment.
    const invariant = result.sites.filter((r) => INVARIANT_SITES.includes(r.site));
    assert.equal(invariant.length, 5);
    for (const row of invariant) {
      assert.equal(row.isVariable, false, `site ${row.site}`);
      for (const field of ["lrt", "logLrt", "zScore", "percentile"]) {
        assert.equal(row[field], 0, `site ${row.site} ${field}`);
      }
      assert.equal(row.call, "Neutral");
    }
    // And the complement, so this cannot pass by marking everything invariant.
    const variable = result.sites.filter((r) => !INVARIANT_SITES.includes(r.site));
    assert.equal(variable.length, 25);
    assert.ok(variable.every((r) => r.isVariable === true));
  });

  it("computes z-scores and percentiles over the variable sites only", () => {
    const variable = result.sites.filter((r) => r.isVariable);
    const percentiles = variable.map((r) => r.percentile);

    // The negative evidence: five mid-table sites hold percentile 0. A percentile rank computed
    // over all 30 rows could not put five of them at the bottom AND leave the rest spread out —
    // the zeros are there because those rows were excluded from the ranking, not ranked low.
    for (const row of result.sites.filter((r) => !r.isVariable)) {
      assert.equal(row.percentile, 0, `site ${row.site} percentile`);
    }

    // The positive evidence: over the 25 ranked rows the percentiles span the full range, so the
    // ranking really was taken over that subset.
    assert.ok(Math.max(...percentiles) >= 98, `max percentile ${Math.max(...percentiles)}`);
    assert.ok(Math.min(...percentiles) > 0, `min percentile ${Math.min(...percentiles)}`);

    // Standardising over a subset forces that subset's mean to zero. Including the zeroed
    // invariant rows would drag the mean down and inflate every z-score, which is the entire
    // reason they are excluded.
    const meanZ = variable.reduce((a, r) => a + r.zScore, 0) / variable.length;
    assert.ok(Math.abs(meanZ) < 1e-6, `mean z-score over variable sites was ${meanZ}`);
  });

  it("labels calls according to the requested callMode", () => {
    assert.equal(result.summary.callMode, "percentile");
    assert.equal(zscoreResult.summary.callMode, "zscore");

    // SHAPE, not count. Two sites tie at the top percentile here, and how many rows clear a gate is
    // a property of this fixture's numbers rather than of the calling logic; pinning the count
    // would make an ort build that shifts the last digit look like a logic regression. What must
    // hold is that the label says which question was asked — DM3 once resolved the mode with
    // opposite precedence in the gates and in the summary line, so a config carrying both could
    // score on percentiles while the footer claimed "Z >= 2.5".
    for (const row of result.sites.filter((r) => r.call !== "Neutral")) {
      assert.match(row.call, /^Top \d+%$/, `percentile-mode call at site ${row.site}`);
    }
    for (const row of zscoreResult.sites.filter((r) => r.call !== "Neutral")) {
      assert.match(row.call, /^Z ≥ /, `zscore-mode call at site ${row.site}`);
    }
  });

  it("actually changes the calls when callMode changes", () => {
    // Separate from the label test on purpose. This one depends on the fixture's numbers (measured:
    // percentile mode calls 2 sites, zscore mode calls none, because the model's z-scores here top
    // out near 1.7 against a 2.0 gate), so if a future runtime nudges it, the label + summary
    // assertions above still carry the intent and only this case needs revisiting.
    const percentileCalls = result.sites.map((r) => r.call);
    const zscoreCalls = zscoreResult.sites.map((r) => r.call);
    assert.notDeepEqual(percentileCalls, zscoreCalls);
  });

  it("honours calling.mode when callMode is absent, and callMode when both are given", async () => {
    // calling.mode alone must survive to the gates AND the summary. The regression this guards is
    // a default callMode stomping it — scoring on percentiles while the config asked for zscore.
    const viaCalling = await predictAxomeme({
      alignmentText: fasta,
      treeText: nwk,
      calling: { mode: "zscore" }
    });
    assert.equal(viaCalling.summary.callMode, "zscore");
    assert.deepEqual(viaCalling.sites, zscoreResult.sites);

    // And the other half of the precedence: an explicit callMode still wins over calling.mode.
    const bothGiven = await predictAxomeme({
      alignmentText: fasta,
      treeText: nwk,
      callMode: "zscore",
      calling: { mode: "percentile" }
    });
    assert.equal(bothGiven.summary.callMode, "zscore");
    assert.deepEqual(bothGiven.sites, zscoreResult.sites);
  });

  it("refuses an unknown callMode instead of silently scoring on percentiles", async () => {
    await assert.rejects(
      predictAxomeme({ alignmentText: fasta, treeText: nwk, callMode: "bayes-factor" }),
      (err) => {
        assert.match(err.message, /callMode/);
        assert.ok(err.message.includes("bayes-factor"), "names the rejected value");
        for (const mode of ["percentile", "zscore", "pvalue"]) {
          assert.ok(err.message.includes(mode), `lists valid mode ${mode}`);
        }
        return true;
      }
    );
  });

  it("passes an unknown calling.mode through to buildPredictions untouched", async () => {
    // DM3 parity: only an EXPLICIT callMode is validated. A mode arriving via calling.mode
    // reaches buildPredictions as-is — it falls to the LRT-gate else branch there — and the
    // summary echoes what was actually in effect rather than a sanitised substitute.
    const r = await predictAxomeme({
      alignmentText: fasta,
      treeText: nwk,
      calling: { mode: "mystery" }
    });
    assert.equal(r.summary.callMode, "mystery");
  });

  it("treats maxSpecies: null exactly like an omitted maxSpecies", async () => {
    // Number(null) is 0, so an unguarded clamp would collapse null to the 2-taxon floor and
    // silently score a two-sequence subsample. null must mean "not set".
    const r = await predictAxomeme({
      alignmentText: fasta,
      treeText: nwk,
      maxSpecies: null
    });
    assert.equal(r.summary.speciesUsed, 8);
    assert.deepEqual(r.sites, result.sites);
  });

  it("reports the sha256 of the model it actually loaded", () => {
    // Catches the DM3 bug this line was written against: a verifyHash:false session resolves with
    // sha256: null, and `sha256 ?? VERIFIED_MODEL_SHA256` then stamps the pinned constant onto a
    // result produced by a model that was never checked. On the production path the two agree
    // because the load verified them; this asserts the production path is what ran.
    assert.equal(result.modelSha256, VERIFIED_MODEL_SHA256);
    assert.equal(zscoreResult.modelSha256, VERIFIED_MODEL_SHA256);
  });

  it("refuses a topology-only tree", async () => {
    // Not defensive noise. The model reads a patristic distance matrix: with no branch lengths
    // every pair of sequences is equidistant, the matrix and the MDS embedding are all zeros, and
    // the graph returns confident per-site numbers computed from nothing at all. An error is the
    // only honest output here.
    await assert.rejects(
      predictAxomeme({ alignmentText: fasta, treeText: TOPOLOGY_ONLY }),
      /branch length/i
    );
  });

  it("refuses a missing tree", async () => {
    // A tree is not optional for AxoMEME the way it is for some HyPhy methods, and a non-empty
    // string is not enough — all three of these have to reach the same refusal.
    for (const treeText of ["", "   ", null]) {
      await assert.rejects(
        predictAxomeme({ alignmentText: fasta, treeText }),
        /needs a phylogenetic tree/i
      );
    }
    await assert.rejects(
      predictAxomeme({ alignmentText: fasta }),
      /needs a phylogenetic tree/i
    );
  });
});
