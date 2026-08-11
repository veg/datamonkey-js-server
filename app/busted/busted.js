/**
 * BUSTED analysis (Phase 2, #410).
 *
 * Migrated to the shared lib/analysis-factory.js. The analysis-specific logic
 * now lives in ./descriptor.js; this module preserves the original export shape
 * (exports.busted is the constructor) and the require path used by server.js and
 * lib/mcp/spawn-helpers.js.
 */

module.exports = require("./descriptor.js");
