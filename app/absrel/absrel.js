// Migrated to the declarative analysis factory (Phase 2, #410).
// The constructor and descriptor now live in ./descriptor.js; this module
// preserves the original `require("./absrel.js").absrel` export shape.
module.exports = require("./descriptor.js");
