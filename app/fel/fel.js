/**
 * FEL analysis (Phase 2, #410).
 *
 * The hand-written constructor has been migrated to a declarative descriptor
 * (./descriptor.js) built on the shared lib/analysis-factory.js. This module
 * simply re-exports that descriptor's constructor to preserve the original
 * export shape: consumers do require("./app/fel/fel.js") and use `.fel`.
 *
 * Factory output is proven byte-identical to the original qsub_params by
 * test/golden/factory-parity.js against test/golden/qsub-params.snapshot.json.
 */

module.exports = require("./descriptor.js");
