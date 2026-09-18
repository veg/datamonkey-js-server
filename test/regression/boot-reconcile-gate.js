// #455 static tripwire: server.js must reconcile active_jobs against the
// scheduler at boot instead of blindly deleting the list, and both spawn
// surfaces (socket routes AND the MCP server) must be gated behind that
// reconciliation. A pure source-text check — no redis, no scheduler, no
// server boot — so it runs first-class in CI and fails loudly if a future
// refactor reintroduces the old `client.del("active_jobs")` or hoists a
// spawn surface out of the gate.
var fs = require("fs"),
  path = require("path"),
  should = require("should");

var serverSrc = fs.readFileSync(
  path.join(__dirname, "../../server.js"),
  "utf8"
);
var reconcileSrc = fs.readFileSync(
  path.join(__dirname, "../../lib/reconcile.js"),
  "utf8"
);

describe("boot-time reconciliation gate (#455 tripwire)", function () {
  it("server.js never blindly deletes active_jobs", function () {
    serverSrc.should.not.containEql('del("active_jobs"');
    serverSrc.should.not.containEql("del('active_jobs'");
  });

  it("reconciliation gates both spawn surfaces (socket routes and the MCP server)", function () {
    var reconcileAt = serverSrc.indexOf("reconcileActiveJobs");
    var socketAt = serverSrc.indexOf('io.sockets.on("connection"');
    var mcpAt = serverSrc.indexOf("startMcpServer(");
    reconcileAt.should.be.aboveOrEqual(0);
    socketAt.should.be.aboveOrEqual(0);
    mcpAt.should.be.aboveOrEqual(0);
    reconcileAt.should.be.below(socketAt);
    reconcileAt.should.be.below(mcpAt);
  });

  it("lib/reconcile.js keeps the fail-open contract", function () {
    reconcileSrc.should.containEql("leaving active_jobs untouched");
  });
});
