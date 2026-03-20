var z = require("zod"),
  logger = require("../logger.js").logger,
  spawnHelpers = require("./spawn-helpers"),
  jobdel = require("../jobdel.js");

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
        var types = Object.keys(spawnHelpers.analysisInfo).map(function (key) {
          return Object.assign({ type: key }, spawnHelpers.analysisInfo[key]);
        });
        return {
          content: [{ type: "text", text: JSON.stringify(types, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
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
      params: z.record(z.any()).optional().describe("Additional analysis-specific parameters (e.g., branches, genetic_code)")
    },
    async function (args) {
      try {
        logger.info("MCP spawn_analysis: " + args.analysis_type);
        var jobId = spawnHelpers.spawnAnalysis(
          args.analysis_type,
          args.alignment,
          args.tree || null,
          args.params || {}
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ job_id: jobId, analysis_type: args.analysis_type })
          }]
        };
      } catch (err) {
        logger.error("MCP spawn_analysis error: " + err.message);
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
        var jobData = await new Promise(function (resolve, reject) {
          redisClient.hgetall(args.job_id, function (err, data) {
            if (err) return reject(err);
            resolve(data);
          });
        });

        if (!jobData) {
          return {
            content: [{ type: "text", text: JSON.stringify({ status: "not_found" }) }]
          };
        }

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
        var jobData = await new Promise(function (resolve, reject) {
          redisClient.hgetall(args.job_id, function (err, data) {
            if (err) return reject(err);
            resolve(data);
          });
        });

        if (!jobData) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Job not found" }) }],
            isError: true
          };
        }

        if (jobData.status !== "completed") {
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

        return {
          content: [{ type: "text", text: JSON.stringify(results) }]
        };
      } catch (err) {
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
        var jobData = await new Promise(function (resolve, reject) {
          redisClient.hgetall(args.job_id, function (err, data) {
            if (err) return reject(err);
            resolve(data);
          });
        });

        if (!jobData) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "Job not found" }) }],
            isError: true
          };
        }

        if (jobData.status === "completed") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, message: "Job already completed" })
            }]
          };
        }

        if (jobData.status === "aborted") {
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

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, job_id: args.job_id })
          }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true
        };
      }
    }
  );
}

exports.registerTools = registerTools;
