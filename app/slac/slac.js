/**
 * SLAC analysis (Phase 2, #410).
 *
 * The hand-written constructor has been migrated to the declarative
 * lib/analysis-factory.js builder; app/slac/descriptor.js holds the
 * analysis-specific pieces. This module re-exports the factory-built
 * constructor, preserving the original export shape (exports.slac = <ctor>)
 * and file path that consumers (server.js, lib/mcp/spawn-helpers.js) require.
 */

module.exports = require("./descriptor.js");
