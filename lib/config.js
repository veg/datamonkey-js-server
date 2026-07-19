/**
 * lib/config.js — validated config loader (Phase 3, #410).
 *
 * Historically every module did `require("../config.json")` directly (27 sites),
 * with no validation: a missing or mistyped key surfaced as `undefined` at some
 * call site deep in a job submission, not at startup. This module loads
 * config.json, validates the critical keys with zod (already a dependency),
 * applies environment-variable overrides, and exports the validated object.
 *
 * Behavior for a VALID config is unchanged — the exported object has the same
 * keys/values as config.json (plus any env overrides). An INVALID config now
 * fails fast at startup with a clear message instead of an undefined-at-runtime
 * bug.
 *
 * USAGE (drop-in): replace `require("../config.json")` with `require("../lib/config")`.
 *
 * ENV OVERRIDES: a handful of deploy-critical keys can be overridden via env
 * (useful for containers): DM_REDIS_HOST, DM_REDIS_PORT, DM_REDIS_PASSWORD,
 * DM_SUBMIT_TYPE, DM_PORT, DM_MCP_PORT. Others can be added as needed.
 */

var path = require("path");
var { z } = require("zod");

// Load the raw config.json (same file every module used to require directly).
var raw;
try {
  raw = require(path.join(__dirname, "..", "config.json"));
} catch (e) {
  // Re-throw with a clearer message; a missing config.json is a hard startup error.
  throw new Error("config.js: could not load config.json — " + e.message);
}

// Apply environment-variable overrides for deploy-critical keys.
function applyEnvOverrides(cfg) {
  var out = Object.assign({}, cfg);
  if (process.env.DM_REDIS_HOST) out.redis_host = process.env.DM_REDIS_HOST;
  if (process.env.DM_REDIS_PORT) out.redis_port = parseInt(process.env.DM_REDIS_PORT, 10);
  if (process.env.DM_REDIS_PASSWORD) out.redis_password = process.env.DM_REDIS_PASSWORD;
  if (process.env.DM_SUBMIT_TYPE) out.submit_type = process.env.DM_SUBMIT_TYPE;
  if (process.env.DM_PORT) out.port = parseInt(process.env.DM_PORT, 10);
  if (process.env.DM_MCP_PORT) out.mcp_port = parseInt(process.env.DM_MCP_PORT, 10);
  return out;
}

// Schema for the CRITICAL keys the server can't run without. The many optional
// per-analysis keys (<analysis>_procs/_walltime/_nodes/_memory) and tool paths
// are allowed through via .passthrough() rather than enumerated — validating
// them all strictly would risk rejecting valid production configs, and they are
// read defensively (with `|| default`) at their call sites anyway.
var schema = z
  .object({
    port: z.number({ invalid_type_error: "port must be a number" }),
    redis_host: z.string().min(1, "redis_host is required"),
    redis_port: z.number({ invalid_type_error: "redis_port must be a number" }),
    redis_password: z.string().optional(),
    submit_type: z.enum(["slurm", "qsub", "local"], {
      errorMap: function () {
        return { message: "submit_type must be one of: slurm, qsub, local" };
      }
    }),
    // Present in most deployments; optional so a minimal (e.g. local/CI) config
    // without SLURM still validates.
    slurm_partition: z.string().optional(),
    slurm_mpi_type: z.string().optional(),
    mcp_port: z.number().optional(),
    loglevel: z.string().optional()
  })
  .passthrough();

var merged = applyEnvOverrides(raw);

var result = schema.safeParse(merged);
if (!result.success) {
  var issues = result.error.issues
    .map(function (i) {
      return "  - " + (i.path.join(".") || "(root)") + ": " + i.message;
    })
    .join("\n");
  throw new Error("Invalid config.json:\n" + issues);
}

module.exports = result.data;
