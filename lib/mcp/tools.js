const z = require("zod"),
  logger = require("../logger.js").logger,
  spawnHelpers = require("./spawn-helpers"),
  jobdel = require("../jobdel.js"),
  validation = require("./validation");

// ── axomeme_scan size caps ──────────────────────────────────────────
//
// axomeme_scan answers IN the tool call rather than queueing a job, so the whole
// prediction — including a synchronous MDS eigendecomposition measured at ~0.6-1.9 s
// on mid-sized alignments — runs on this process's event loop and stalls every other
// MCP session on it. That is accepted at v1 ONLY because of the caps below; moving the
// prediction onto a worker_thread is the planned follow-up. Loosening these without
// that follow-up trades a bounded stall for an unbounded one.
//
// MAX_ALIGNMENT_CHARS is enforced by the zod schema (cheap, before the string is
// touched). The other two need a parse, so they are enforced in the handler.
// The work term is totalCodons * N^2: the model reads an N x N distance matrix per
// site, so cost grows quadratically in taxa, not linearly.
const MAX_ALIGNMENT_CHARS = 8 * 1024 * 1024;
const MAX_SYNC_CODONS = 12000;
const MAX_SYNC_WORK = 2.5e9;

/**
 * Error envelope for axomeme_scan — the same {content:[{type:"text",...}], isError:true}
 * shape the other tools build inline, with a JSON body of {error, hint?}.
 *
 * @param {string} error   what went wrong, in one sentence
 * @param {string} [hint]  what the caller can do about it
 * @returns {{content: Array<object>, isError: boolean}}
 */
function axomemeError(error, hint) {
  const body = { error: error };
  if (hint) body.hint = hint;
  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    isError: true
  };
}

/**
 * Register all MCP tools on the given McpServer instance.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} mcpServer
 * @param {import("redis").RedisClient} redisClient
 * @param {object} [notifier]  per-session job notifier (see lib/mcp/job-notifier.js).
 *   When provided, spawn_analysis subscribes to the job's redis channel and
 *   pushes an SSE completion notification to this session (#379). Optional —
 *   when absent, jobs are tracked only via get_job_status polling.
 */
function registerTools(mcpServer, redisClient, notifier) {

  // ── list_analyses ─────────────────────────────────────────────────
  mcpServer.tool(
    "list_analyses",
    "List all available HyPhy analysis types and their parameters",
    {},
    async function () {
      try {
        logger.info("MCP tool call: list_analyses");
        const types = Object.keys(spawnHelpers.analysisInfo).map(function (key) {
          return Object.assign({ type: key }, spawnHelpers.analysisInfo[key]);
        });
        logger.info("MCP list_analyses: returning " + types.length + " analyses");
        return {
          content: [{ type: "text", text: JSON.stringify(types, null, 2) }]
        };
      } catch (err) {
        logger.error("MCP list_analyses error: " + err.message);
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true
        };
      }
    }
  );

  // ── validate_alignment ───────────────────────────────────────────
  mcpServer.tool(
    "validate_alignment",
    "Pre-flight check: validates alignment format, codon frame, stop codons, and optionally analysis-specific parameters.",
    {
      alignment: z.string().describe("Alignment data (FASTA format)"),
      analysis_type: z.enum([
        "absrel", "fel", "busted", "relax", "meme", "slac", "fubar",
        "gard", "cfel", "multihit", "nrm", "fade", "bgm", "bstill",
        "difFubar", "prime", "hivtrace"
      ]).optional().describe("Analysis type to validate parameters for (optional)"),
      tree: z.string().optional().describe("Newick tree string (checked for branch labels if analysis_type is provided)")
    },
    async function (args) {
      try {
        logger.info("MCP tool call: validate_alignment" +
          (args.analysis_type ? " analysis_type=" + args.analysis_type : "") +
          " alignment_length=" + (args.alignment ? args.alignment.length : 0) + " chars");
        const alignResult = validation.validateAlignment(args.alignment);
        let allErrors = alignResult.errors.slice();
        let allWarnings = alignResult.warnings.slice();

        // If analysis type requires codons and alignment is not in codon frame, promote warnings to errors
        if (args.analysis_type && validation.CODON_METHODS.indexOf(args.analysis_type) !== -1) {
          const sequences = validation.parseFasta(args.alignment);
          const frameCheck = validation.checkCodonFrame(sequences);
          if (!frameCheck.valid) {
            allErrors = allErrors.concat(frameCheck.errors.map(function (w) {
              return w + " (required for " + args.analysis_type + ")";
            }));
            // Remove from warnings since they are now errors
            allWarnings = allWarnings.filter(function (w) {
              return w.indexOf("not divisible by 3") === -1;
            });
          }
        }

        // Validate analysis-specific params
        if (args.analysis_type) {
          const paramResult = validation.validateAnalysisParams(
            args.analysis_type,
            args.tree || null,
            {}
          );
          allErrors = allErrors.concat(paramResult.errors);
          allWarnings = allWarnings.concat(paramResult.warnings);
        }

        const valid = alignResult.valid && allErrors.length === 0;

        const response = {
          valid: valid,
          sequence_count: alignResult.sequence_count,
          alignment_length: alignResult.alignment_length,
          errors: allErrors,
          warnings: allWarnings
        };

        logger.info("MCP validate_alignment: valid=" + valid +
          " sequences=" + alignResult.sequence_count +
          " errors=" + allErrors.length + " warnings=" + allWarnings.length);
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          isError: !valid
        };
      } catch (err) {
        logger.error("MCP validate_alignment error: " + err.message);
        return {
          content: [{ type: "text", text: "Validation error: " + err.message }],
          isError: true
        };
      }
    }
  );

  // ── spawn_analysis ────────────────────────────────────────────────
  mcpServer.tool(
    "spawn_analysis",
    "Submit a new HyPhy analysis job. Returns the job_id for tracking.",
    {
      analysis_type: z.enum([
        "absrel", "fel", "busted", "relax", "meme", "slac", "fubar",
        "gard", "cfel", "multihit", "nrm", "fade", "bgm", "bstill",
        "difFubar", "prime", "hivtrace"
      ]).describe("The type of analysis to run"),
      alignment: z.string().describe("Alignment data (FASTA or Nexus format)"),
      tree: z.string().optional().describe("Newick tree string (optional for some analyses)"),
      params: z.object({}).passthrough().optional().describe("Additional analysis-specific parameters (e.g., branches, genetic_code)")
    },
    async function (args) {
      try {
        logger.info("MCP tool call: spawn_analysis type=" + args.analysis_type +
          " alignment_length=" + (args.alignment ? args.alignment.length : 0) + " chars" +
          " has_tree=" + !!args.tree + " has_params=" + !!(args.params && Object.keys(args.params).length));

        // Pre-flight validation
        let warnings = [];

        // Validate alignment
        const alignResult = validation.validateAlignment(args.alignment);
        if (!alignResult.valid) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Alignment validation failed",
                details: alignResult.errors,
                warnings: alignResult.warnings
              }, null, 2)
            }],
            isError: true
          };
        }
        warnings = warnings.concat(alignResult.warnings);

        // Check codon frame for methods that require it
        if (validation.CODON_METHODS.indexOf(args.analysis_type) !== -1) {
          const sequences = validation.parseFasta(args.alignment);
          const frameCheck = validation.checkCodonFrame(sequences);
          if (!frameCheck.valid) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  error: "Codon alignment required for " + args.analysis_type,
                  details: frameCheck.errors,
                  hint: "All sequence lengths must be divisible by 3 for codon-based analyses."
                }, null, 2)
              }],
              isError: true
            };
          }
        }

        // Validate analysis-specific params
        const paramResult = validation.validateAnalysisParams(
          args.analysis_type,
          args.tree || null,
          args.params || {}
        );
        if (!paramResult.valid) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Parameter validation failed for " + args.analysis_type,
                details: paramResult.errors,
                warnings: paramResult.warnings
              }, null, 2)
            }],
            isError: true
          };
        }
        warnings = warnings.concat(paramResult.warnings);

        const jobId = spawnHelpers.spawnAnalysis(
          args.analysis_type,
          args.alignment,
          args.tree || null,
          args.params || {}
        );

        logger.info("MCP spawn_analysis: spawned job_id=" + jobId + " type=" + args.analysis_type);

        // Subscribe this session to the job's redis channel so it receives an
        // SSE completion/failure notification when the job finishes (#379).
        // Best-effort: a subscriber failure must never fail the spawn — the job
        // still runs and the client can poll get_job_status.
        if (notifier) {
          try {
            notifier.watch(jobId, args.analysis_type);
          } catch (watchErr) {
            logger.error("MCP spawn_analysis: notifier.watch failed for job_id=" +
              jobId + ": " + watchErr.message);
          }
        }

        const response = { job_id: jobId, analysis_type: args.analysis_type };
        if (warnings.length > 0) {
          response.warnings = warnings;
          logger.info("MCP spawn_analysis: warnings=" + JSON.stringify(warnings));
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response)
          }]
        };
      } catch (err) {
        logger.error("MCP spawn_analysis error: " + err.message + "\n" + err.stack);
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true
        };
      }
    }
  );

  // ── get_job_status ────────────────────────────────────────────────
  mcpServer.tool(
    "get_job_status",
    "Query the current status of a job by its ID",
    {
      job_id: z.string().describe("The job ID returned from spawn_analysis")
    },
    async function (args) {
      try {
        logger.info("MCP tool call: get_job_status job_id=" + args.job_id);
        const jobData = await redisClient.hGetAll(args.job_id);

        if (!jobData || Object.keys(jobData).length === 0) {
          logger.info("MCP get_job_status: job_id=" + args.job_id + " not found");
          return {
            content: [{ type: "text", text: JSON.stringify({ status: "not_found" }) }]
          };
        }

        logger.info("MCP get_job_status: job_id=" + args.job_id + " status=" + (jobData.status || "unknown"));

        const response = {
          status: jobData.status || "unknown",
          job_id: args.job_id
        };

        if (jobData.torque_id) {
          try {
            response.torque_id = JSON.parse(jobData.torque_id).torque_id;
          } catch (e) {
            response.torque_id = jobData.torque_id;
          }
        }

        if (jobData.current_status) {
          response.current_status = jobData.current_status;
        }

        if (jobData.metadata) {
          try {
            response.metadata = JSON.parse(jobData.metadata);
          } catch (e) {}
        }

        if (jobData.error) {
          try {
            response.error = JSON.parse(jobData.error);
          } catch (e) {
            response.error = jobData.error;
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
        };
      } catch (err) {
        logger.error("MCP get_job_status error: " + err.message);
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true
        };
      }
    }
  );

  // ── get_job_results ───────────────────────────────────────────────
  mcpServer.tool(
    "get_job_results",
    "Retrieve the results of a completed job. Returns the full HyPhy JSON output.",
    {
      job_id: z.string().describe("The job ID returned from spawn_analysis")
    },
    async function (args) {
      try {
        logger.info("MCP tool call: get_job_results job_id=" + args.job_id);
        const jobData = await redisClient.hGetAll(args.job_id);

        if (!jobData || Object.keys(jobData).length === 0) {
          logger.info("MCP get_job_results: job_id=" + args.job_id + " not found");
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Job not found" }) }],
            isError: true
          };
        }

        if (jobData.status !== "completed") {
          logger.info("MCP get_job_results: job_id=" + args.job_id + " not completed, status=" + jobData.status);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Job not completed yet",
                status: jobData.status
              })
            }],
            isError: true
          };
        }

        if (!jobData.results) {
          logger.warn("MCP get_job_results: job_id=" + args.job_id + " completed but no results");
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "No results available" }) }],
            isError: true
          };
        }

        // Results are stored double-nested: JSON.stringify({ results: JSON.stringify(data), type: "completed" })
        // Same unwrapping logic as server.js job:status handler
        let results;
        try {
          const parsedResults = JSON.parse(jobData.results);
          if (parsedResults.results && typeof parsedResults.results === "string") {
            results = JSON.parse(parsedResults.results);
          } else {
            results = parsedResults.results || parsedResults;
          }
        } catch (e) {
          results = jobData.results;
        }

        const resultStr = JSON.stringify(results);
        logger.info("MCP get_job_results: job_id=" + args.job_id + " returning " + resultStr.length + " chars");
        return {
          content: [{ type: "text", text: resultStr }]
        };
      } catch (err) {
        logger.error("MCP get_job_results error: " + err.message);
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true
        };
      }
    }
  );

  // ── cancel_job ────────────────────────────────────────────────────
  mcpServer.tool(
    "cancel_job",
    "Cancel a running or queued job",
    {
      job_id: z.string().describe("The job ID to cancel")
    },
    async function (args) {
      try {
        logger.info("MCP tool call: cancel_job job_id=" + args.job_id);
        const jobData = await redisClient.hGetAll(args.job_id);

        if (!jobData || Object.keys(jobData).length === 0) {
          logger.info("MCP cancel_job: job_id=" + args.job_id + " not found");
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "Job not found" }) }],
            isError: true
          };
        }

        if (jobData.status === "completed") {
          logger.info("MCP cancel_job: job_id=" + args.job_id + " already completed");
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, message: "Job already completed" })
            }]
          };
        }

        if (jobData.status === "aborted") {
          logger.info("MCP cancel_job: job_id=" + args.job_id + " already cancelled");
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, message: "Job already cancelled" })
            }]
          };
        }

        // Extract torque_id and cancel
        let torqueId = "";
        try {
          torqueId = JSON.parse(jobData.torque_id).torque_id;
        } catch (e) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: false, error: "Could not retrieve scheduler job ID" })
            }],
            isError: true
          };
        }

        try {
          await new Promise(function (resolve, reject) {
            jobdel.jobDelete(torqueId, function (err) {
              if (err) return reject(err);
              resolve();
            });
          });
        } finally {
          // #453: expire the torque_id reverse-lookup hash even if the scheduler
          // delete failed (jobDelete rejects on non-zero exit), so a failed
          // cancel can't leak a TTL-less hash. expireTerminal never rejects.
          await require("../redis-client").expireTerminal(torqueId);
        }

        await redisClient.hSet(args.job_id, "status", "aborted");
        await redisClient.lRem("active_jobs", 1, args.job_id);
        // #453: expire the cancelled job hash so it doesn't linger forever.
        await require("../redis-client").expireTerminal(args.job_id);

        // A cancelled job never publishes a terminal packet on its redis
        // channel, so the #379 completion watcher would otherwise pin a
        // subscriber for the life of the session. Tear it down explicitly.
        // Best-effort — unwatch is idempotent and must never fail the cancel.
        if (notifier) {
          try {
            notifier.unwatch(args.job_id);
          } catch (unwatchErr) {
            logger.error("MCP cancel_job: notifier.unwatch failed for job_id=" +
              args.job_id + ": " + unwatchErr.message);
          }
        }

        logger.info("MCP cancel_job: job_id=" + args.job_id + " cancelled (torque_id=" + torqueId + ")");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, job_id: args.job_id })
          }]
        };
      } catch (err) {
        logger.error("MCP cancel_job error: " + err.message);
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true
        };
      }
    }
  );

  // ── axomeme_scan ──────────────────────────────────────────────────
  mcpServer.tool(
    "axomeme_scan",
    "Rank codon sites by MEME-like episodic selection signal using the AxoMEME 2.0 neural " +
    "surrogate. Returns per-site predictions in THIS call, in seconds — no job is queued and " +
    "there is no job_id to poll. AxoMEME predicts what MEME would report and orders sites " +
    "within one alignment; it does NOT produce calibrated significance, so its scores are a " +
    "ranking for triage, not evidence, and a site of interest should be confirmed with a real " +
    "MEME run. Requires a tree WITH branch lengths — the model reads them as the distance " +
    'matrix. For very large alignments use spawn_analysis({analysis_type: "axomeme"}) once it ' +
    "is available.",
    {
      alignment: z.string()
        .max(
          MAX_ALIGNMENT_CHARS,
          "Alignment is too large for a synchronous scan (limit " + MAX_ALIGNMENT_CHARS + " characters)"
        )
        .describe("Codon alignment, FASTA or NEXUS. Gaps are preserved and must keep every sequence in column register."),
      tree: z.string()
        .describe("Newick tree WITH branch lengths — required. The branch lengths become the patristic distance matrix the model reads, so a topology-only tree is refused rather than scored."),
      call_mode: z.enum(["percentile", "zscore", "pvalue"]).optional()
        .describe("How a site is called. \"percentile\" (the default) ranks sites within THIS alignment. \"zscore\" gates on standardised scores. \"pvalue\" uses fixed chi-square gates that the surrogate's scores rarely reach, so it usually reports nothing."),
      max_species: z.number().int().min(2).max(512).optional()
        .describe("Cap on the number of taxa fed to the model (2-512, default 512). Above the cap, taxa are chosen by maximum phylogenetic diversity."),
      reference_sequence: z.string().optional()
        .describe("Name of the sequence that defines the site numbering and the reported codons. Allowed characters: letters, digits, underscore, dot, pipe, colon and hyphen (1-128 characters).")
    },
    async function (args) {
      try {
        // Required INSIDE the handler, not at module scope. lib/mcp/stdio.js is spawned
        // once per tool invocation, so every list_analyses / job_status call would
        // otherwise pay for loading the AxoMEME core. (predict.js itself never requires
        // onnxruntime-node — session.js defers that to the first loadSession call — so
        // this require stays cheap even on the AxoMEME path until the model is needed.)
        const { predictAxomeme, SAFE_SEQUENCE_NAME } = require("../axomeme/predict.js");
        const { treeHasBranchLengths } = require("../axomeme/vendor/tree-inspect.js");
        const { parseAlignment, stripEmbeddedTrees } = require("../axomeme/vendor/alignment.js");

        logger.info("MCP tool call: axomeme_scan" +
          " alignment_length=" + (args.alignment ? args.alignment.length : 0) + " chars" +
          " tree_length=" + (args.tree ? args.tree.length : 0) + " chars" +
          (args.call_mode ? " call_mode=" + args.call_mode : "") +
          (args.max_species ? " max_species=" + args.max_species : ""));

        // (1) Sequence name, BEFORE any parsing or model work. The same expression the
        // SLURM job descriptor validates against — a name reaching this tool may be
        // interpolated into an --export list later, and this is the one definition.
        if (args.reference_sequence != null && !SAFE_SEQUENCE_NAME.test(args.reference_sequence)) {
          logger.info("MCP axomeme_scan: rejected reference_sequence");
          return axomemeError(
            "reference_sequence is not a usable sequence name.",
            "Allowed characters are letters, digits, underscore (_), dot (.), pipe (|), " +
            "colon (:) and hyphen (-), 1-128 characters. Spaces, commas, quotes and other " +
            "shell metacharacters are refused. Use the sequence's name exactly as it appears " +
            "in the alignment header."
          );
        }

        // (2) Tree gates, before the alignment is parsed and long before the model loads.
        // predictAxomeme refuses both cases itself; doing it here makes the refusal fast
        // and lets the tool attach an actionable hint.
        const tree = typeof args.tree === "string" ? args.tree.trim() : "";
        if (!tree) {
          logger.info("MCP axomeme_scan: rejected — no tree supplied");
          return axomemeError(
            "AxoMEME needs a phylogenetic tree and none was supplied.",
            "Infer a neighbor-joining tree for this alignment or upload one of your own, " +
            "with branch lengths, and pass it as `tree`."
          );
        }
        if (!treeHasBranchLengths(tree)) {
          logger.info("MCP axomeme_scan: rejected — topology-only tree");
          return axomemeError(
            "AxoMEME needs a tree with branch lengths — it reads them as evolutionary " +
            "distances. This tree has none, so every pair of sequences would look equally " +
            "related and the model would return confident numbers computed from nothing.",
            "Infer a neighbor-joining tree or upload one with branch lengths."
          );
        }

        // (3) Size gate. This parse is only a probe: predictAxomeme re-parses and ITS parse
        // is the one that feeds the model. The probe therefore has to parse the SAME text
        // predict will — stripEmbeddedTrees included — or a FASTA carrying a newick line
        // ahead of the first header is refused here as unparseable while predict would
        // have read it fine.
        //
        // The codon count is the LONGEST sequence, not the first. prepareAlignment sizes
        // the run off the REFERENCE sequence, and the reference is not necessarily
        // sequences[0]: an explicit reference_sequence wins, and failing that a sequence
        // named hg/hg38/human is picked by chooseReference's heuristic. On a ragged file
        // (">s1\nATG" followed by a 40,000-codon "human") a first-sequence probe measures
        // 1 codon and waves through a 40,000-codon run. The longest sequence bounds every
        // reference choice, so it is the only measure that cannot be steered by the caller.
        let probe;
        try {
          probe = parseAlignment(stripEmbeddedTrees(args.alignment));
        } catch (parseErr) {
          logger.info("MCP axomeme_scan: alignment parse failed: " + parseErr.message);
          return axomemeError(
            "Could not read the alignment: " + parseErr.message,
            "axomeme_scan accepts FASTA (headers starting with '>') or NEXUS (a MATRIX block). " +
            "Every sequence must be in codon frame and aligned to the same length."
          );
        }
        const sequenceCount = probe.sequences.length;
        let longestSequence = 0;
        for (let i = 0; i < probe.sequences.length; i++) {
          const len = probe.sequences[i].sequence.length;
          if (len > longestSequence) longestSequence = len;
        }
        const totalCodons = Math.floor(longestSequence / 3);
        if (totalCodons > MAX_SYNC_CODONS ||
            totalCodons * sequenceCount * sequenceCount > MAX_SYNC_WORK) {
          logger.info("MCP axomeme_scan: rejected — too large for a synchronous scan," +
            " codons=" + totalCodons + " sequences=" + sequenceCount);
          return axomemeError(
            "This alignment is too large for a synchronous scan (" + totalCodons +
            " codon sites x " + sequenceCount + " sequences). axomeme_scan answers in the " +
            "tool call, so it is capped at " + MAX_SYNC_CODONS + " codon sites and at " +
            "sites x sequences^2 <= " + MAX_SYNC_WORK + ".",
            'Run it as a queued job with spawn_analysis({analysis_type: "axomeme"}) — that ' +
            "path ships separately and is not wired up yet — or scan a smaller alignment " +
            "(fewer sequences, or fewer codon sites). Note that max_species does not help " +
            "here: the cap is measured on the file as submitted, before any taxon subsampling."
          );
        }

        // threads is deliberately NOT passed: there is no axomeme_procs key in
        // config.json/config.json.tpl, and session.js defaults to one intra-op thread,
        // which is right for a process that is one worker among many on a shared box.
        // Wire config.axomeme_procs through here when that key ships with the job path.
        const result = await predictAxomeme({
          alignmentText: args.alignment,
          treeText: tree,
          callMode: args.call_mode,
          maxSpecies: args.max_species,
          referenceSequence: args.reference_sequence
        });

        const resultStr = JSON.stringify(result);
        logger.info("MCP axomeme_scan: scored " + result.summary.totalSites + " sites," +
          " species_used=" + result.summary.speciesUsed +
          " call_mode=" + result.summary.callMode +
          " returning " + resultStr.length + " chars");
        return {
          content: [{ type: "text", text: resultStr }]
        };
      } catch (err) {
        // A non-Error throw (string, null) must still produce an isError envelope —
        // dereferencing err.code/err.message on it would throw INSIDE the catch and
        // escape the handler entirely.
        const message = (err && err.message) || String(err);
        const code = err && err.code;

        // (4) A model-integrity failure is a SERVER problem — a missing artifact, an
        // unreadable one, a hash that does not match the pin in vendor/modelContract.js,
        // a graph missing a contracted input, or an AxoMEME module that is not installed
        // at all. Nothing the caller sends can fix it, so it must not be reported as if
        // their alignment were at fault. ENOENT is conjoined with the session.js wrapper
        // message so an unrelated future file read cannot masquerade as a model failure.
        if ((code === "ENOENT" && /model read failed/i.test(message)) ||
            code === "MODULE_NOT_FOUND" ||
            /model hash mismatch|model read failed|missing expected inputs/i.test(message)) {
          logger.error("MCP axomeme_scan model integrity error: " + message);
          return axomemeError(
            "The AxoMEME model could not be loaded on the server. This is a server-side " +
            "model problem, not a problem with your alignment or tree: " + message,
            "Nothing about the submitted data will change this — report it to the " +
            "Datamonkey operators."
          );
        }

        // The tree gates above should have caught these, so reaching here means predict
        // saw something the fast check did not. Keep the actionable hint either way.
        if (/needs a phylogenetic tree|branch lengths/i.test(message)) {
          logger.info("MCP axomeme_scan: tree rejected by predict: " + message);
          return axomemeError(
            message,
            "Infer a neighbor-joining tree or upload one with branch lengths."
          );
        }

        logger.error("MCP axomeme_scan error: " + message);
        return axomemeError(
          "AxoMEME could not score this alignment: " + message,
          "Check that the alignment is a codon alignment in FASTA or NEXUS format, that the " +
          "sequence names match the tips of the tree, and that reference_sequence (if given) " +
          "names a sequence in the file."
        );
      }
    }
  );
}

// Tool names exported for the /.well-known/mcp.json manifest
const TOOL_NAMES = [
  "list_analyses",
  "validate_alignment",
  "spawn_analysis",
  "get_job_status",
  "get_job_results",
  "cancel_job",
  "axomeme_scan"
];

exports.registerTools = registerTools;
exports.TOOL_NAMES = TOOL_NAMES;
