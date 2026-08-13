/**
 * predict.js — the AxoMEME prediction core, shared by the MCP tool and the job CLI.
 *
 * This is a direct port of DM3's AxomemeAnalysisRunner.runAnalysis (datamonkey3
 * src/lib/services/AxomemeAnalysisRunner.js) with the browser lifecycle removed. The phase
 * order, the percentages, the batching, the statistics and the result shape are deliberately
 * identical: DM3 and this server must produce the same JSON for the same inputs, and every
 * divergence here is a silently different answer rather than an error.
 *
 * WHAT IT IS NOT. AxoMEME is a SURROGATE for MEME, not MEME. It predicts what MEME's per-site
 * statistics would be, in seconds instead of hours, and it is wrong sometimes in ways a fitted
 * model is not. `isSurrogate` is on the result rather than implied for that reason.
 *
 * The two gates before any scoring happens — a tree, and a tree with branch lengths — carry
 * AnalyzeTab.svelte's messages verbatim. They are not defensive noise: the model reads a
 * patristic distance matrix, and a topology-only tree yields an all-zero matrix and an all-zero
 * embedding, from which the model returns confident numbers computed from nothing.
 */

const { parseAlignment, stripEmbeddedTrees } = require("./vendor/alignment.js");
const { prepareAlignment, batchSizeFor } = require("./vendor/assemble.js");
const {
  buildPredictions,
  siteVariability,
  CALL_DEFAULTS,
} = require("./vendor/postprocess.js");
const {
  validateInputBundle,
  VERIFIED_MODEL_SHA256,
  MAX_SPECIES_DEFAULT,
} = require("./vendor/modelContract.js");
const {
  inspectBranchLengths,
  treeHasBranchLengths,
} = require("./vendor/tree-inspect.js");
const { loadSession, runSites } = require("./session.js");

/** The checkpoint this core serves. Reported on every result; keep in step with the artifact. */
const MODEL_VERSION = "2.0-viral-finetuned";

/**
 * Below this magnitude a negative branch length is float noise from NJ's unclamped subtraction,
 * not a broken tree. Matches DM3's threshold for the distance-clamping notice.
 */
const NOISY_NEGATIVE = -0.001;

/**
 * Calling modes buildPredictions understands. An EXPLICIT `callMode` outside this list is refused
 * with an error rather than silently coerced — a caller who typed "z-score" wants zscore semantics,
 * not percentile ones under a zscore label. A mode arriving only via `options.calling.mode` passes
 * through untouched (DM3 parity: buildPredictions falls to its else branch for a mode it does not
 * recognise).
 */
const CALL_MODES = ["percentile", "zscore", "pvalue"];

/**
 * What a sequence name may contain to be safe to pass onward.
 *
 * A FASTA header reaches this module from an uploaded file and is later interpolated into a
 * SLURM `--export=...` string by the job descriptor. Anything outside this class — quotes,
 * commas, spaces, shell metacharacters — either breaks the export list or injects into it.
 * Exported here so the descriptor and the MCP tool validate against ONE definition rather than
 * three that drift apart.
 */
const SAFE_SEQUENCE_NAME = /^[A-Za-z0-9_.|:-]{1,128}$/;

/**
 * Hard bounds on the taxon cap. 512 is the value the tensors are padded to (modelContract).
 *
 * INTENTIONAL DIVERGENCE FROM DM3, which would embed at whatever maxSpecies you ask for. The
 * server contract pins max_species to the model's 512 training envelope, and both public surfaces
 * (the MCP tool and the job CLI) enforce 2..512 — a request outside that range is clamped here
 * rather than handed to the model as a tensor shape it was never trained on.
 */
const MIN_SPECIES = 2;
const MAX_SPECIES_CAP = 512;

/** Verbatim from AnalyzeTab.svelte:167-184. Do not reword — DM3 and the server must agree. */
const NO_TREE_MESSAGE =
  "AxoMEME needs a phylogenetic tree. Infer one or upload your own before running it.";
const NO_BRANCH_LENGTHS_MESSAGE =
  "AxoMEME needs a tree with branch lengths — it reads them as evolutionary distances. " +
  "This tree has none, so every pair of sequences would look equally related. Infer a " +
  "neighbor-joining tree or upload one with branch lengths.";

/**
 * Emit progress without letting the sink take the run down with it.
 *
 * The CLI's sink writes a progress file and the MCP sink pushes a notification; both can fail
 * for reasons that have nothing to do with the prediction (full disk, closed transport). A run
 * that has already done the expensive work must not be lost to a failed status update.
 *
 * @param {((update: {phase: string, percent: number, message: string}) => void)|undefined} onProgress
 * @param {string} phase
 * @param {number} percent
 * @param {string} message
 */
function report(onProgress, phase, percent, message) {
  if (typeof onProgress !== "function") return;
  try {
    onProgress({ phase, percent, message });
  } catch {
    // Progress is advisory. Swallowing this is the point.
  }
}

/**
 * Clamp the taxon cap to an integer in [2, 512]; anything unusable falls back to the default.
 *
 * null is checked BEFORE Number(): Number(null) is 0, so without the guard `maxSpecies: null`
 * would clamp to 2 and silently score a two-taxon subsample instead of behaving like "not set".
 * null, undefined and non-finite values all mean the same thing here: use MAX_SPECIES_DEFAULT.
 */
function clampMaxSpecies(value) {
  if (value == null) return MAX_SPECIES_DEFAULT;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return MAX_SPECIES_DEFAULT;
  return Math.min(MAX_SPECIES_CAP, Math.max(MIN_SPECIES, n));
}

/**
 * Score every codon site of an alignment with the AxoMEME 2.0 surrogate.
 *
 * @param {object} options
 * @param {string} options.alignmentText FASTA or NEXUS, gaps intact
 * @param {string} options.treeText newick WITH branch lengths — required, see the gates below
 * @param {string} [options.callMode] one of CALL_MODES — anything else throws; when omitted,
 *   `calling.mode` applies, and with neither the default is CALL_DEFAULTS.mode ("percentile")
 * @param {number} [options.maxSpecies] taxon cap, clamped to [2, 512]; null behaves like undefined
 * @param {string} [options.referenceSequence] name of the sequence that defines the site count
 * @param {number} [options.threads] passed through to the session
 * @param {number} [options.batchBudgetBytes] tensor budget per batch; default is batchSizeFor's
 * @param {string} [options.modelPath] override the .onnx location
 * @param {object} [options.calling] extra buildPredictions gate overrides; `callMode` still wins
 * @param {(update: {phase: string, percent: number, message: string}) => void} [options.onProgress]
 * @returns {Promise<object>} the DM3 AxoMEME result document
 */
async function predictAxomeme(options = {}) {
  const {
    alignmentText,
    treeText,
    callMode,
    maxSpecies,
    referenceSequence,
    threads,
    batchBudgetBytes,
    modelPath,
    onProgress,
  } = options;

  // Refuse an explicit mode the gates do not implement — coercing it to percentile would score a
  // different question than the caller asked and then label the calls with the coerced mode. A
  // mode arriving only via options.calling.mode is passed through below, as DM3 does.
  if (callMode != null && !CALL_MODES.includes(callMode)) {
    throw new Error(
      `Unknown callMode "${callMode}". Valid modes: ${CALL_MODES.join(", ")}.`
    );
  }
  const speciesCap = clampMaxSpecies(maxSpecies);

  // --- parsing -----------------------------------------------------------------------------
  report(onProgress, "parsing", 5, "Reading alignment...");
  if (typeof alignmentText !== "string" || !alignmentText.trim()) {
    throw new Error("No sequence data available in the alignment");
  }
  // vendor/alignment.js, NOT lib/mcp/validation.js's parseFasta: that one strips gap characters
  // for frame checking, and a de-gapped alignment shifts every gapped sequence out of column
  // register — the model then scores a different site than the one it reports.
  // stripEmbeddedTrees first: a trailing newick line in a FASTA upload would otherwise be
  // appended to the last sequence and quietly corrupt that taxon's codons.
  const parsed = parseAlignment(stripEmbeddedTrees(alignmentText));
  const names = parsed.sequences.map((s) => s.header);
  const sequences = parsed.sequences.map((s) => s.sequence);
  if (names.length === 0)
    throw new Error("No sequences found in the alignment");

  // --- tree gates --------------------------------------------------------------------------
  // Unlike some HyPhy methods a tree is not optional here, and a non-empty string is not enough.
  const tree = typeof treeText === "string" ? treeText.trim() : "";
  if (!tree) throw new Error(NO_TREE_MESSAGE);
  if (!treeHasBranchLengths(tree)) throw new Error(NO_BRANCH_LENGTHS_MESSAGE);
  const treeReport = inspectBranchLengths(tree);

  // --- preparing ---------------------------------------------------------------------------
  report(
    onProgress,
    "preparing",
    15,
    "Computing tree distances and embedding..."
  );
  const prepared = prepareAlignment({
    names,
    sequences,
    treeText: tree,
    maxSpecies: speciesCap,
    referenceName: referenceSequence,
  });
  if (prepared.totalCodons === 0) {
    throw new Error("The reference sequence is shorter than one codon");
  }

  // --- loading -----------------------------------------------------------------------------
  report(onProgress, "loading", 30, "Preparing the model...");
  const { session, sha256, ort } = await loadSession({ threads, modelPath });

  // --- running -----------------------------------------------------------------------------
  const budget =
    Number.isFinite(batchBudgetBytes) && batchBudgetBytes > 0
      ? Math.floor(batchBudgetBytes)
      : undefined;
  const batch =
    budget === undefined
      ? batchSizeFor(prepared.speciesCount)
      : batchSizeFor(prepared.speciesCount, budget);

  // dist_matrix, mds_coords and padding_mask are per-ALIGNMENT — batch() emits b memcpy'd copies
  // of one array. Validating every batch rescans up to the whole budget to re-check the same
  // N x N block b times. Validate in full once; after that the invariant tensors cannot change.
  let fullyValidated = false;
  const accumulated = {
    lrt: [],
    alpha: [],
    beta_neg: [],
    beta_pos: [],
    p_neg: [],
  };
  for (let start = 0; start < prepared.totalCodons; start += batch) {
    const bundle = prepared.batch(start, batch);
    if (!fullyValidated) {
      const check = validateInputBundle(bundle, {
        batch: bundle.msa_codons.dims[0],
        numSpecies: prepared.speciesCount,
        windowSize: prepared.windowSize,
      });
      if (!check.ok) {
        throw new Error(
          `AxoMEME input check failed: ${check.errors.slice(0, 3).join("; ")}`
        );
      }
      fullyValidated = true;
    }

    const out = await runSites(session, bundle, ort);
    // NOT `push(...out[key])`. batchSizeFor scales as 1/N^2, so a few-taxon alignment gets
    // batches of 10^5-10^6 sites, and spreading that many elements into a call blows V8's
    // argument limit with "Maximum call stack size exceeded" partway through the run. DM3
    // measured the throw at 167,772 elements — exactly the batch size for a 10-taxon alignment.
    for (const key of Object.keys(accumulated)) {
      const src = out[key];
      for (let i = 0; i < src.length; i++) accumulated[key].push(src[i]);
    }

    const done = Math.min(start + batch, prepared.totalCodons);
    report(
      onProgress,
      "running",
      40 + Math.round((done / prepared.totalCodons) * 50),
      `Scoring site ${done} of ${prepared.totalCodons}...`
    );
  }

  // --- processing --------------------------------------------------------------------------
  report(onProgress, "processing", 95, "Building per-site results...");
  // Variability is judged over the SELECTED species, which is what the model saw — not over every
  // sequence in the file, which may include taxa the tree did not contain. BY INDEX, not
  // `names.indexOf(name)`: with duplicate FASTA headers indexOf returns the FIRST match while
  // orderSpecies keeps the LAST, so the flags would come from a different sequence than the one
  // the model was tokenised from.
  const selectedSeqs = prepared.selectedIndices.map((i) => sequences[i] ?? "");
  const variable = siteVariability(selectedSeqs, prepared.totalCodons);
  const refSeq = sequences[prepared.referenceIndex] ?? sequences[0];
  const refCodons = Array.from({ length: prepared.totalCodons }, (_, i) =>
    refSeq.slice(i * 3, i * 3 + 3)
  );
  // ONE source of truth for the calling mode, built exactly as DM3 builds it. The scoring gates
  // and the summary line that tells a reader what a "call" means used to resolve this with
  // opposite precedence in DM3, so a config carrying both could score on percentiles while the
  // footer claimed "Z >= 2.5". An explicit callMode wins over calling.mode; when callMode is
  // absent, calling.mode survives rather than being stomped by a default.
  const callConfig = {
    ...(options.calling ?? {}),
    ...(callMode ? { mode: callMode } : {}),
  };
  const sites = buildPredictions(
    accumulated,
    { refCodons, variable },
    callConfig
  );

  // Only surface tree problems worth acting on. inspectBranchLengths reports ANY negative branch,
  // and NJ routinely emits float noise around -1e-5. Warning about those trains users to ignore the
  // warning box, which is worse than not having one. A meaningfully negative tree still gets
  // through, via this filter and via mostNegativeDistance.
  const treeReasons = treeReport && !treeReport.ok ? treeReport.reasons : [];
  const minDistance = treeReport?.min ?? 0;
  const treeWarnings = treeReasons.filter(
    (r) => !/negative/.test(r) || minDistance <= NOISY_NEGATIVE
  );

  return {
    method: "AxoMEME",
    modelVersion: MODEL_VERSION,
    modelSha256: sha256 ?? VERIFIED_MODEL_SHA256,
    // Load-bearing for every consumer: these are PREDICTIONS of what MEME would report, not MEME.
    isSurrogate: true,
    surrogateFor: "MEME",
    sites,
    summary: {
      totalSites: prepared.totalCodons,
      variableSites: sites.filter((s) => s.isVariable).length,
      calledSites: sites.filter((s) => s.call !== "Neutral").length,
      speciesUsed: prepared.speciesCount,
      speciesInAlignment: names.length,
      referenceSequence: prepared.referenceName,
      callMode: callConfig.mode ?? CALL_DEFAULTS.mode,
      matchedFromTree: prepared.matchedFromTree,
      duplicateSelections: prepared.duplicateSelections,
      // Reported, not hidden. Clamping matches the model's training pipeline, so it is not an
      // error — but a tree whose distances are meaningfully negative is a different situation
      // from one carrying float noise, and only the magnitude distinguishes them.
      clampedDistances: prepared.clampedDistances,
      mostNegativeDistance: prepared.mostNegativeDistance,
      treeWarnings,
    },
  };
}

module.exports = { predictAxomeme, SAFE_SEQUENCE_NAME, CALL_MODES };
