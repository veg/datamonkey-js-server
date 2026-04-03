var z = require("zod"),
  logger = require("../logger.js").logger,
  spawnHelpers = require("./spawn-helpers"),
  jobdel = require("../jobdel.js"),
  validation = require("./validation");

/**
 * Register all MCP tools on the given McpServer instance.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} mcpServer
 * @param {import("redis").RedisClient} redisClient
 */
function registerTools(mcpServer, redisClient) {

  // ── list_analyses ─────────────────────────────────────────────────
  mcpServer.tool(
    "list_analyses",
    "List all available HyPhy analysis types and their parameters",
    {},
    async function () {
      try {
        logger.info("MCP tool call: list_analyses");
        var types = Object.keys(spawnHelpers.analysisInfo).map(function (key) {
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
        "difFubar", "prime", "hivtrace", "flea"
      ]).optional().describe("Analysis type to validate parameters for (optional)"),
      tree: z.string().optional().describe("Newick tree string (checked for branch labels if analysis_type is provided)")
    },
    async function (args) {
      try {
        logger.info("MCP tool call: validate_alignment" +
          (args.analysis_type ? " analysis_type=" + args.analysis_type : "") +
          " alignment_length=" + (args.alignment ? args.alignment.length : 0) + " chars");
        var alignResult = validation.validateAlignment(args.alignment);
        var allErrors = alignResult.errors.slice();
        var allWarnings = alignResult.warnings.slice();

        // If analysis type requires codons and alignment is not in codon frame, promote warnings to errors
        if (args.analysis_type && validation.CODON_METHODS.indexOf(args.analysis_type) !== -1) {
          var sequences = validation.parseFasta(args.alignment);
          var frameCheck = validation.checkCodonFrame(sequences);
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
          var paramResult = validation.validateAnalysisParams(
            args.analysis_type,
            args.tree || null,
            {}
          );
          allErrors = allErrors.concat(paramResult.errors);
          allWarnings = allWarnings.concat(paramResult.warnings);
        }

        var valid = alignResult.valid && allErrors.length === 0;

        var response = {
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
        "difFubar", "prime", "hivtrace", "flea"
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
        var warnings = [];

        // Validate alignment
        var alignResult = validation.validateAlignment(args.alignment);
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
          var sequences = validation.parseFasta(args.alignment);
          var frameCheck = validation.checkCodonFrame(sequences);
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
        var paramResult = validation.validateAnalysisParams(
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

        var jobId = spawnHelpers.spawnAnalysis(
          args.analysis_type,
          args.alignment,
          args.tree || null,
          args.params || {}
        );

        logger.info("MCP spawn_analysis: spawned job_id=" + jobId + " type=" + args.analysis_type);

        var response = { job_id: jobId, analysis_type: args.analysis_type };
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
        var jobData = await new Promise(function (resolve, reject) {
          redisClient.hgetall(args.job_id, function (err, data) {
            if (err) return reject(err);
            resolve(data);
          });
        });

        if (!jobData) {
          logger.info("MCP get_job_status: job_id=" + args.job_id + " not found");
          return {
            content: [{ type: "text", text: JSON.stringify({ status: "not_found" }) }]
          };
        }

        logger.info("MCP get_job_status: job_id=" + args.job_id + " status=" + (jobData.status || "unknown"));

        var response = {
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
        var jobData = await new Promise(function (resolve, reject) {
          redisClient.hgetall(args.job_id, function (err, data) {
            if (err) return reject(err);
            resolve(data);
          });
        });

        if (!jobData) {
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
        var results;
        try {
          var parsedResults = JSON.parse(jobData.results);
          if (parsedResults.results && typeof parsedResults.results === "string") {
            results = JSON.parse(parsedResults.results);
          } else {
            results = parsedResults.results || parsedResults;
          }
        } catch (e) {
          results = jobData.results;
        }

        var resultStr = JSON.stringify(results);
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
        var jobData = await new Promise(function (resolve, reject) {
          redisClient.hgetall(args.job_id, function (err, data) {
            if (err) return reject(err);
            resolve(data);
          });
        });

        if (!jobData) {
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
        var torqueId = "";
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

        await new Promise(function (resolve, reject) {
          jobdel.jobDelete(torqueId, function (err) {
            if (err) return reject(err);
            resolve();
          });
        });

        redisClient.hset(args.job_id, "status", "aborted");
        redisClient.lrem("active_jobs", 1, args.job_id);

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
}

// Tool names exported for the /.well-known/mcp.json manifest
var TOOL_NAMES = [
  "list_analyses",
  "validate_alignment",
  "spawn_analysis",
  "get_job_status",
  "get_job_results",
  "cancel_job"
];

exports.registerTools = registerTools;
exports.TOOL_NAMES = TOOL_NAMES;
