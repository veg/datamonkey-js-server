/**
 * PRIME analysis (Phase 2, #410).
 *
 * The job-submission logic now lives in app/prime/descriptor.js, built by the
 * shared lib/analysis-factory.js. This module preserves the original require
 * path and export shape (exports.prime is the constructor) for server.js and
 * lib/mcp/spawn-helpers.js.
 */

module.exports = require("./descriptor.js");
