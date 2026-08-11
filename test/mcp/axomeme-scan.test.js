/**
 * axomeme-scan.test.js — the MCP axomeme_scan tool, end to end against the real ONNX graph.
 *
 * The tool is the only MCP surface that computes its answer IN the call rather than queueing a
 * job, so what has to be tested here is not the prediction numbers (test/axomeme/predict.test.js
 * owns those) but the boundary: which inputs are refused, how fast they are refused, and whether
 * the full result document survives the trip through the tool envelope intact.
 *
 * ORDER MATTERS IN ONE PLACE. The "cheap refusal" suite asserts that a bad reference_sequence
 * returns WITHOUT loading onnxruntime-node — a delta check, so it holds whether or not something
 * earlier in the mocha process already loaded the runtime, and it is declared before the suites
 * that do load it so it means something on a normal run.
 *
 * THIS FILE RUNS IN ITS OWN MOCHA PROCESS (`npm run test:mcp-axomeme`, chained from test:mcp).
 * Not tidiness — measured: sharing a process with test/mcp/mcp.test.js makes the run exit 1 with
 * "libc++abi: terminating ... mutex lock failed" AFTER every test passes. That suite drives the
 * real shared redis client, which leaves the loop non-empty at teardown, and the onnxruntime-node
 * 1.23.2 destructor defect worked around in `after` below only survives an unwind this file
 * controls. Adding this spec to the same mocha invocation as the other MCP specs turns a green
 * suite into a red CI job. Fold it back in when onnxruntime-node is unpinned.
 */

const chai = require("chai");
const expect = chai.expect;
const fs = require("fs");
const path = require("path");

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { registerTools, TOOL_NAMES } = require("../../lib/mcp/tools");
const sessionModule = require("../../lib/axomeme/session.js");
const { VERIFIED_MODEL_SHA256 } = require("../../lib/axomeme/vendor/modelContract.js");

const fasta = fs.readFileSync(path.join(__dirname, "../axomeme/res/small.fasta"), "utf8");
const nwk = fs.readFileSync(path.join(__dirname, "../axomeme/res/small.nwk"), "utf8");

/** The same topology with every branch length removed — a negative case, derived not hand-typed. */
const TOPOLOGY_ONLY = nwk.replace(/:-?\d+(\.\d+)?([eE][-+]?\d+)?/g, "");

// ── Mock Redis (same shape as test/mcp/mcp.test.js) ───────────────────
function createMockRedis(store) {
  return {
    hGetAll: function (id) {
      return Promise.resolve(store[id] || {});
    },
    hSet: function () {
      return Promise.resolve();
    },
    lRem: function () {
      return Promise.resolve();
    }
  };
}

// ── Helper: invoke a registered MCP tool ──────────────────────────────
async function callTool(mcpServer, name, args) {
  var tool = mcpServer._registeredTools[name];
  if (!tool) throw new Error("Tool not registered: " + name);
  return tool.handler(args || {});
}

function newServer() {
  var mcpServer = new McpServer(
    { name: "test", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  registerTools(mcpServer, createMockRedis({}));
  return mcpServer;
}

/** Is the native ONNX runtime in this process's module cache right now? */
function ortLoaded() {
  return Object.keys(require.cache).some(function (k) {
    return k.includes("onnxruntime");
  });
}

// =====================================================================
// Suite 0: manifest
// =====================================================================
describe("MCP axomeme_scan – manifest", function () {
  it("TOOL_NAMES includes axomeme_scan", function () {
    expect(TOOL_NAMES).to.include("axomeme_scan");
  });

  it("registerTools registers the tool", function () {
    var mcpServer = newServer();
    expect(mcpServer._registeredTools).to.have.property("axomeme_scan");
  });
});

// =====================================================================
// Suite 1: refusals that must happen BEFORE any model work
// =====================================================================
describe("MCP axomeme_scan – cheap refusals", function () {
  var mcpServer;

  before(function () {
    mcpServer = newServer();
  });

  it("rejects an unsafe reference_sequence without loading the ONNX runtime", async function () {
    // DELTA, not absolute: if some earlier file in this mocha process already required
    // onnxruntime-node, "absent" is not assertable — but "did not become present" always is.
    // A sequence name reaching the job descriptor is interpolated into a SLURM --export list,
    // so a comma or an '=' has to be refused at the boundary, and refused cheaply.
    var before = ortLoaded();
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: fasta,
      tree: nwk,
      reference_sequence: "a,b=c"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.include("reference_sequence");
    expect(parsed.hint).to.match(/allowed characters/i);
    // Names the class it accepts rather than just saying "invalid".
    expect(parsed.hint).to.include("underscore");
    if (!before) {
      expect(ortLoaded()).to.equal(
        false,
        "reference_sequence validation must return before the model is loaded"
      );
    }
  });

  it("rejects a missing tree with the infer-a-tree hint", async function () {
    var result = await callTool(mcpServer, "axomeme_scan", { alignment: fasta });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.match(/needs a phylogenetic tree/i);
    expect(parsed.hint).to.match(/neighbor-joining/i);
    expect(parsed.hint).to.match(/branch lengths/i);
  });

  it("rejects a blank tree the same way as a missing one", async function () {
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: fasta,
      tree: "   "
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.match(/needs a phylogenetic tree/i);
  });

  it("rejects a topology-only tree", async function () {
    // Not defensive noise: with no branch lengths the patristic matrix and the MDS embedding are
    // all zeros, and the graph returns confident per-site numbers computed from nothing.
    expect(TOPOLOGY_ONLY).to.not.include(":");
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: fasta,
      tree: TOPOLOGY_ONLY
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.match(/branch lengths/i);
    expect(parsed.hint).to.match(/neighbor-joining/i);
  });

  it("rejects an unparseable alignment", async function () {
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: "ATGATGATG\nATGCTGATG\n",
      tree: "(s1:0.1,s2:0.1);"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.match(/could not read the alignment/i);
    expect(parsed.hint).to.match(/FASTA/);
  });

  it("rejects an alignment too large for a synchronous scan", async function () {
    // 40,000 codons over the 12,000-site cap, built as two sequences so the fixture costs
    // ~240 KB rather than the megabytes a taxon-heavy oversize case would.
    var long = "ATG".repeat(40000);
    var big = ">s1\n" + long + "\n>s2\n" + long + "\n";
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: big,
      tree: "(s1:0.1,s2:0.1);"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.match(/too large for a synchronous scan/i);
    expect(parsed.error).to.include("40000");
    expect(parsed.hint).to.include("spawn_analysis");
    expect(parsed.hint).to.include("axomeme");
  });

  it("measures the cap on the LONGEST sequence, not the first", async function () {
    // REGRESSION. prepareAlignment sizes the run off the REFERENCE sequence, and the
    // reference is not necessarily sequences[0] — an explicit reference_sequence wins.
    // A probe that measured sequences[0] read 1 codon here and waved through a
    // 40,000-codon run, defeating the only thing keeping the scan off the event loop.
    var long = "ATG".repeat(40000);
    var ragged = ">s1\nATG\n>big\n" + long + "\n";
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: ragged,
      tree: "(s1:0.1,big:0.1);",
      reference_sequence: "big"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.match(/too large for a synchronous scan/i);
    expect(parsed.error).to.include("40000");
  });

  it("measures the cap on a heuristic reference the caller never named", async function () {
    // No reference_sequence at all: chooseReference's hg/hg38/human heuristic picks the
    // long sequence, so the same bypass is reachable with no extra argument.
    var long = "ATG".repeat(40000);
    var ragged = ">s1\nATG\n>human\n" + long + "\n";
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: ragged,
      tree: "(s1:0.1,human:0.1);"
    });
    expect(result.isError).to.be.true;
    expect(JSON.parse(result.content[0].text).error).to.match(/too large/i);
  });

  it("probes the same text predict parses (embedded tree stripped)", async function () {
    // Falls through the probe into a real (tiny) prediction, so it pays a cold model load.
    this.timeout(60000);
    // predictAxomeme parses stripEmbeddedTrees(alignment). A probe that parsed the raw
    // text refused this file with "Sequence data found before header" even though the
    // prediction would have read it, turning a valid upload into a user-facing error.
    var withTree = "(s1:0.1,s2:0.1);\n>s1\nATGATG\n>s2\nATGCTG\n";
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: withTree,
      tree: "(s1:0.1,s2:0.1);"
    });
    if (result.isError) {
      expect(JSON.parse(result.content[0].text).error)
        .to.not.match(/could not read the alignment/i);
    }
  });

  it("enforces the sites x sequences^2 work budget, not just the site cap", async function () {
    // 600 sequences x 8000 codons: 8000 <= 12000 passes the codon cap, but
    // 8000 * 600^2 = 2.88e9 > 2.5e9 trips the work budget. Deleting that clause
    // in tools.js must turn this red — it survived mutation before this test.
    this.timeout(30000);
    var seq = new Array(8000 + 1).join("ATG");
    var parts = [];
    for (var i = 0; i < 600; i++) parts.push(">seq" + i + "\n" + seq);
    var ortBefore = Object.keys(require.cache).some(function (p) {
      return p.indexOf("onnxruntime") !== -1;
    });
    var result = await callTool(mcpServer, "axomeme_scan", {
      alignment: parts.join("\n"),
      tree: nwk
    });
    expect(result.isError).to.equal(true);
    var body = JSON.parse(result.content[0].text);
    expect(body.error).to.match(/too large for a synchronous scan/i);
    expect(body.error).to.match(/sequences/i);
    if (!ortBefore) {
      var ortAfter = Object.keys(require.cache).some(function (p) {
        return p.indexOf("onnxruntime") !== -1;
      });
      expect(ortAfter).to.equal(false, "work-budget refusal must not load the runtime");
    }
  });

  it("caps alignment size at the zod layer (8 MB), which handler-direct calls bypass", function () {
    // callTool() invokes the handler beneath zod, so nothing else in this file
    // exercises the .max() on `alignment`. safeParse is the layer a real MCP
    // transport goes through; deleting the .max() must turn this red.
    var tool = mcpServer._registeredTools["axomeme_scan"];
    var oversize = tool.inputSchema.safeParse({
      alignment: new Array(8 * 1024 * 1024 + 2).join("x"),
      tree: nwk
    });
    expect(oversize.success).to.equal(false);
    var fine = tool.inputSchema.safeParse({ alignment: fasta, tree: nwk });
    expect(fine.success).to.equal(true);
  });
});

// =====================================================================
// Suite 2: the happy path, against the real 3.78 MB artifact
// =====================================================================
describe("MCP axomeme_scan – prediction", function () {
  // Generous only for a cold native-runtime load on a busy box; the work itself is ~1 s.
  this.timeout(60000);

  var mcpServer;
  var result;

  before(async function () {
    mcpServer = newServer();
    var raw = await callTool(mcpServer, "axomeme_scan", {
      alignment: fasta,
      tree: nwk
    });
    expect(raw.isError, "scan returned an error: " + raw.content[0].text).to.not.be.true;
    result = JSON.parse(raw.content[0].text);
  });

  after(async function () {
    // Hand the graph back rather than waiting for GC, and empty the memo so nothing else in the
    // process inherits a session it did not ask for.
    if (sessionModule.isSessionLoaded()) {
      var loaded = await sessionModule.loadSession();
      if (typeof loaded.session.release === "function") await loaded.session.release();
    }
    sessionModule.resetSession();

    // --- workaround for an onnxruntime-node teardown defect, not for anything in this repo ---
    //
    // WHY THIS FILE ALSO CLOSES REDIS. Nothing here uses it, but lib/mcp/tools pulls in
    // lib/jobdel -> lib/redis-client, which opens a shared connection at require time. That
    // open handle is exactly what stops Node from unwinding on its own, which is the only exit
    // path onnxruntime-node survives (see below). Closing it is therefore load-bearing, not
    // tidiness — and it is why THIS FILE MUST BE THE LAST SPEC in any mocha invocation that
    // includes it: a later suite would find the shared client closed.
    try {
      var redisMod = require("../../lib/redis-client");
      if (redisMod.client.isOpen) await redisMod.client.quit();
    } catch (e) {
      /* best-effort teardown */
    }

    // Carried verbatim in intent from test/axomeme/predict.test.js: once ANY InferenceSession has
    // been created, onnxruntime-node 1.23.2 cannot survive process.exit() — libc's exit() runs the
    // runtime's static destructors in an order they do not tolerate and the process aborts with
    // status 1 after every test has passed. Node's NORMAL exit path unwinds cleanly, so the fix is
    // to stop forcing the exit and let it unwind, with an unref'd watchdog in case something else
    // in the run holds the loop open. Scoped to the case that actually breaks. Remove all of this
    // when onnxruntime-node is unpinned.
    if (!ortLoaded()) return;
    var forceExit = process.exit.bind(process);
    process.exit = function (code) {
      if (code !== undefined) process.exitCode = code;
      setTimeout(function () {
        forceExit(process.exitCode === undefined ? 0 : process.exitCode);
      }, 10000).unref();
    };
  });

  it("returns the full AxoMEME result document as parseable JSON", function () {
    expect(result.method).to.equal("AxoMEME");
    expect(result.modelVersion).to.be.a("string").with.length.above(0);
  });

  it("keeps the surrogate flags the caller has to see", function () {
    // Load-bearing for every consumer: these are PREDICTIONS of what MEME would report, not MEME.
    // A tool envelope that dropped them would present a guess as a result.
    expect(result.isSurrogate).to.equal(true);
    expect(result.surrogateFor).to.equal("MEME");
  });

  it("reports the sha256 of the model it actually loaded", function () {
    expect(result.modelSha256).to.equal(VERIFIED_MODEL_SHA256);
  });

  it("returns one site row per summarised site", function () {
    expect(result.sites).to.be.an("array");
    expect(result.sites.length).to.equal(result.summary.totalSites);
    expect(result.summary.totalSites).to.be.greaterThan(0);
  });

  it("defaults to percentile calling", function () {
    expect(result.summary.callMode).to.equal("percentile");
  });

  it("echoes call_mode zscore into the summary", async function () {
    // The label says which question was asked. DM3 once resolved the mode with opposite
    // precedence in the gates and in the summary line, so a config carrying both could score on
    // percentiles while the footer claimed "Z >= 2.5".
    var raw = await callTool(mcpServer, "axomeme_scan", {
      alignment: fasta,
      tree: nwk,
      call_mode: "zscore"
    });
    expect(raw.isError, "scan returned an error: " + raw.content[0].text).to.not.be.true;
    var zscore = JSON.parse(raw.content[0].text);
    expect(zscore.summary.callMode).to.equal("zscore");
    expect(zscore.sites.length).to.equal(result.sites.length);
  });

  it("maps reference_sequence and max_species onto predict's camelCase options", async function () {
    // The tool's arguments are snake_case and predictAxomeme's are camelCase, so the
    // mapping is a hand-written translation with nothing type-checking it. Passing
    // `reference_sequence` straight through would land on an unread key and silently
    // fall back to the heuristic reference; same for max_species and the taxon cap.
    // The summary is where both become observable.
    var raw = await callTool(mcpServer, "axomeme_scan", {
      alignment: fasta,
      tree: nwk,
      reference_sequence: "HIV1_C_ZA_01",
      max_species: 4
    });
    expect(raw.isError, "scan returned an error: " + raw.content[0].text).to.not.be.true;
    var scoped = JSON.parse(raw.content[0].text);
    expect(scoped.summary.referenceSequence).to.equal("HIV1_C_ZA_01");
    expect(scoped.summary.speciesUsed).to.equal(4);
    // The file has 8 sequences; the cap is what reduced it, not the file.
    expect(scoped.summary.speciesInAlignment).to.equal(8);
  });
});
