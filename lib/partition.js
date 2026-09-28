/**
 * Per-method SLURM partition routing.
 *
 * Each analysis may be sent to its own partition via an optional
 * `<method>_partition` key in config.json, falling back to the shared
 * `slurm_partition`, then to "datamonkey". This mirrors how `<method>_procs`
 * already sizes each method.
 *
 * Why: production runs GARD on a dedicated "gard" partition (node0-2, no
 * oversubscription) so heavy GARD load cannot starve the shared partition via
 * gang scheduling. Keying by method generalizes that isolation to any analysis
 * without per-method code.
 *
 * `method` is the analysis name used for the config key: the descriptor
 * `type` for factory analyses (e.g. "fel", "cfel", "bstill"), "gard", and
 * "difFubar" (camelCase, matching `difFubar_procs`).
 *
 * @param {string} method
 * @param {Object} cfg the loaded config (lib/config.js)
 * @returns {string}
 */
function partitionFor(method, cfg) {
  return (method && cfg[method + "_partition"]) || cfg.slurm_partition || "datamonkey";
}

module.exports = { partitionFor };
