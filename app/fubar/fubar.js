/**
 * FUBAR analysis (Phase 2, #410).
 *
 * The hand-written body has been migrated to the declarative descriptor in
 * ./descriptor.js, built via lib/analysis-factory.js. This module re-exports the
 * descriptor's constructor to preserve the existing require("./fubar.js").fubar
 * export shape used by consumers (server.js, lib/mcp/spawn-helpers.js).
 */

module.exports = require("./descriptor.js");
