/**
 * Contrast-FEL (cfel) — migrated to the declarative descriptor factory
 * (Phase 2, #410). The analysis-specific logic now lives in ./descriptor.js;
 * this module preserves the original require path and exports.cfel export shape.
 */

module.exports = require("./descriptor.js");
