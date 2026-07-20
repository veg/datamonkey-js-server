/**
 * Load-smoke test: statically verify every app/lib source module's require()
 * targets resolve. Catches the class of bug where a dependency is removed from
 * package.json but a module still requires it (which passes the unit suite only
 * because the dev node_modules still has the stale package). See #410.
 *
 * This is a STATIC check (parses require strings, resolves package names) — it
 * does NOT execute the modules (which would open redis/SLURM connections).
 */
var fs = require("fs");
var path = require("path");
var should = require("should"); // eslint-disable-line no-unused-vars

var ROOT = path.join(__dirname, "..");

function jsFiles(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === "node_modules" || e.name === "output" || e.name.startsWith(".")) return;
    var full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(jsFiles(full));
    else if (e.name.endsWith(".js")) out.push(full);
  });
  return out;
}

// External package requires (not relative paths, not node builtins).
var BUILTINS = new Set([
  "fs", "path", "util", "crypto", "events", "child_process", "os", "stream",
  "http", "https", "url", "querystring", "zlib", "assert", "net"
]);

describe("load-smoke: all source require() targets resolve", function () {
  var files = jsFiles(path.join(ROOT, "app")).concat(jsFiles(path.join(ROOT, "lib")));
  files.push(path.join(ROOT, "server.js"));

  it("every external package required by app/lib/server.js is installed", function () {
    var missing = [];
    files.forEach(function (file) {
      var src = fs.readFileSync(file, "utf8");
      var re = /require\((['"])([^'"]+)\1\)/g;
      var m;
      while ((m = re.exec(src))) {
        var mod = m[2];
        if (mod.startsWith(".") || mod.startsWith("/")) continue; // relative
        var pkg = mod.startsWith("@") ? mod.split("/").slice(0, 2).join("/") : mod.split("/")[0];
        if (BUILTINS.has(pkg)) continue;
        try {
          // Resolve the FULL import (mod), not just the package name — packages
          // with an "exports" map (e.g. @modelcontextprotocol/sdk) expose only
          // subpaths, so resolving the bare name would false-alarm. A genuinely
          // missing package still fails here (the whole require can't resolve).
          require.resolve(mod, { paths: [ROOT] });
        } catch (e) {
          missing.push(mod + "  (required by " + path.relative(ROOT, file) + ")");
        }
      }
    });
    var unique = Array.from(new Set(missing));
    unique.should.eql([], "unresolvable package requires:\n  " + unique.join("\n  "));
  });
});
