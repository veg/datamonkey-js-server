/**
 * MEME analysis (Phase 2, #410).
 *
 * The hand-written constructor has been migrated to a declarative descriptor
 * built by lib/analysis-factory.js. This module simply re-exports the
 * descriptor's constructor, preserving the original export shape
 * (exports.meme = <ctor>) and file path used by consumers
 * (server.js, lib/mcp/spawn-helpers.js require("./app/meme/meme.js").meme).
 */

module.exports = require("./descriptor.js");
