// B-STILL analysis — migrated to the declarative descriptor + shared factory
// (Phase 2, #410). The constructor and qsub_params assembly now live in
// app/bstill/descriptor.js via lib/analysis-factory.js; this module preserves
// the original require path and exports.bstill shape.
module.exports = require("./descriptor.js");
