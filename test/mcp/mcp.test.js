const chai = require("chai");
const expect = chai.expect;

// We need to grab the internal exports for unit testing
const spawnHelpers = require("../../lib/mcp/spawn-helpers");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { registerTools } = require("../../lib/mcp/tools");
const { registerPrompts } = require("../../lib/mcp/prompts");
const { registerResources, METHOD_KEYS } = require("../../lib/mcp/resources");
const validation = require("../../lib/mcp/validation");

// ── Mock Redis ────────────────────────────────────────────────────────
function createMockRedis(store) {
  return {
    hgetall: function (id, cb) {
      cb(null, store[id] || null);
    },
    hset: function () {
      // record calls for assertions
      var args = Array.prototype.slice.call(arguments);
      this._hsetCalls = this._hsetCalls || [];
      this._hsetCalls.push(args);
    },
    lrem: function () {
      var args = Array.prototype.slice.call(arguments);
      this._lremCalls = this._lremCalls || [];
      this._lremCalls.push(args);
    },
    _hsetCalls: [],
    _lremCalls: []
  };
}

// ── Helper: invoke a registered MCP tool ──────────────────────────────
async function callTool(mcpServer, name, args) {
  var tool = mcpServer._registeredTools[name];
  if (!tool) throw new Error("Tool not registered: " + name);
  return tool.handler(args || {});
}

// =====================================================================
// Suite 1: spawn-helpers
// =====================================================================
describe("MCP spawn-helpers", function () {

  it("analysisMap contains all 18 analysis types", function () {
    var keys = Object.keys(spawnHelpers.analysisMap);
    expect(keys).to.have.lengthOf(18);
    var expected = [
      "absrel", "bgm", "busted", "difFubar", "fel", "cfel", "flea",
      "fubar", "bstill", "fade", "gard", "hivtrace", "meme", "multihit",
      "nrm", "prime", "relax", "slac"
    ];
    expected.forEach(function (key) {
      expect(spawnHelpers.analysisMap).to.have.property(key);
    });
  });

  it("analysisInfo has metadata for all 18 types", function () {
    var keys = Object.keys(spawnHelpers.analysisInfo);
    expect(keys).to.have.lengthOf(18);
  });

  it("each analysisInfo entry has name, description, and params", function () {
    Object.keys(spawnHelpers.analysisInfo).forEach(function (key) {
      var info = spawnHelpers.analysisInfo[key];
      expect(info).to.have.property("name").that.is.a("string");
      expect(info).to.have.property("description").that.is.a("string");
      expect(info).to.have.property("params").that.is.an("object");
    });
  });

  it("analysisMap keys match analysisInfo keys", function () {
    var mapKeys = Object.keys(spawnHelpers.analysisMap).sort();
    var infoKeys = Object.keys(spawnHelpers.analysisInfo).sort();
    expect(mapKeys).to.deep.equal(infoKeys);
  });

  it("spawnAnalysis throws on unknown analysis type", function () {
    expect(function () {
      spawnHelpers.spawnAnalysis("nonexistent", "ACGT", null, {});
    }).to.throw("Unknown analysis type: nonexistent");
  });

  it("spawnAnalysis passes tree to msa[0].nj for MEME/SLAC/PRIME (issue #367)", function () {
    // Mock fs to prevent actual file writes
    var fs = require("fs");
    var originalWriteFile = fs.writeFile;
    var originalOpenSync = fs.openSync;
    var writtenData = {};
    fs.writeFile = function (path, data, callback) {
      writtenData[path] = data;
      if (callback) callback();
    };
    fs.openSync = function () { return 1; };

    var tree = "((Human:0.01,Chimp:0.01):0.02,Gorilla:0.03);";
    var alignment = ">Human\nATGATGATGATG\n>Chimp\nATGATGATGATG\n>Gorilla\nATGATGATGCTG\n";

    try {
      var jobId = spawnHelpers.spawnAnalysis("meme", alignment, tree, {});
      expect(jobId).to.be.a("string").with.length.above(0);

      // Verify the tree was written (not undefined)
      var treeFiles = Object.keys(writtenData).filter(function (k) { return k.endsWith(".tre"); });
      expect(treeFiles.length).to.equal(1, "Should write exactly one .tre file");
      var writtenTree = writtenData[treeFiles[0]];
      expect(writtenTree).to.be.a("string", "Tree data should be a string, not undefined");
      expect(writtenTree).to.include("Human");
    } finally {
      fs.writeFile = originalWriteFile;
      fs.openSync = originalOpenSync;
    }
  });
});

// =====================================================================
// Suite 2: tools – list_analyses
// =====================================================================
describe("MCP tools – list_analyses", function () {
  var mcpServer;
  var mockRedis;

  before(async function () {
    mockRedis = createMockRedis({});
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    registerTools(mcpServer, mockRedis);
  });

  it("returns an array with 18 entries", async function () {
    var result = await callTool(mcpServer, "list_analyses");
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed).to.be.an("array").with.lengthOf(18);
  });

  it("each entry has type, name, and description fields", async function () {
    var result = await callTool(mcpServer, "list_analyses");
    var parsed = JSON.parse(result.content[0].text);
    parsed.forEach(function (entry) {
      expect(entry).to.have.property("type");
      expect(entry).to.have.property("name");
      expect(entry).to.have.property("description");
    });
  });
});

// =====================================================================
// Suite 3: tools – get_job_status
// =====================================================================
describe("MCP tools – get_job_status", function () {
  var mcpServer;
  var mockRedis;

  before(async function () {
    mockRedis = createMockRedis({
      "job-running-123": {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "12345.scheduler" }),
        current_status: "Phase 2 of 4"
      },
      "job-with-metadata": {
        status: "completed",
        metadata: JSON.stringify({ sites: 100, branches: 10 }),
        error: JSON.stringify({ message: "warning only" })
      }
    });
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    registerTools(mcpServer, mockRedis);
  });

  it("returns not_found for missing job ID", async function () {
    var result = await callTool(mcpServer, "get_job_status", {
      job_id: "does-not-exist"
    });
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).to.equal("not_found");
  });

  it("returns correct status and torque_id for existing job", async function () {
    var result = await callTool(mcpServer, "get_job_status", {
      job_id: "job-running-123"
    });
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).to.equal("running");
    expect(parsed.torque_id).to.equal("12345.scheduler");
    expect(parsed.current_status).to.equal("Phase 2 of 4");
  });

  it("parses metadata and error fields", async function () {
    var result = await callTool(mcpServer, "get_job_status", {
      job_id: "job-with-metadata"
    });
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.metadata).to.deep.equal({ sites: 100, branches: 10 });
    expect(parsed.error).to.deep.equal({ message: "warning only" });
  });
});

// =====================================================================
// Suite 4: tools – get_job_results
// =====================================================================
describe("MCP tools – get_job_results", function () {
  var mcpServer;
  var mockRedis;

  before(async function () {
    var innerResults = JSON.stringify({ sites: [1, 2, 3] });
    mockRedis = createMockRedis({
      "job-incomplete": {
        status: "running"
      },
      "job-done": {
        status: "completed",
        results: JSON.stringify({ results: innerResults, type: "completed" })
      },
      "job-no-results": {
        status: "completed"
        // no results field
      }
    });
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    registerTools(mcpServer, mockRedis);
  });

  it("returns isError when job not found", async function () {
    var result = await callTool(mcpServer, "get_job_results", {
      job_id: "nope"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.equal("Job not found");
  });

  it("returns isError when job not completed", async function () {
    var result = await callTool(mcpServer, "get_job_results", {
      job_id: "job-incomplete"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.equal("Job not completed yet");
    expect(parsed.status).to.equal("running");
  });

  it("returns isError when no results available", async function () {
    var result = await callTool(mcpServer, "get_job_results", {
      job_id: "job-no-results"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.equal("No results available");
  });

  it("unwraps double-nested JSON results correctly", async function () {
    var result = await callTool(mcpServer, "get_job_results", {
      job_id: "job-done"
    });
    expect(result.isError).to.not.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed).to.deep.equal({ sites: [1, 2, 3] });
  });
});

// =====================================================================
// Suite 5: tools – cancel_job
// =====================================================================
describe("MCP tools – cancel_job", function () {
  var mcpServer;
  var mockRedis;

  beforeEach(async function () {
    mockRedis = createMockRedis({
      "job-completed": {
        status: "completed"
      },
      "job-aborted": {
        status: "aborted"
      },
      "job-running": {
        status: "running",
        torque_id: JSON.stringify({ torque_id: "99.scheduler" })
      },
      "job-bad-torque": {
        status: "running",
        torque_id: "not-json"
      }
    });
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    registerTools(mcpServer, mockRedis);
  });

  it("returns isError for missing job", async function () {
    var result = await callTool(mcpServer, "cancel_job", {
      job_id: "nope"
    });
    expect(result.isError).to.be.true;
  });

  it("returns success message for already-completed job", async function () {
    var result = await callTool(mcpServer, "cancel_job", {
      job_id: "job-completed"
    });
    expect(result.isError).to.not.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).to.be.true;
    expect(parsed.message).to.equal("Job already completed");
  });

  it("returns success message for already-cancelled job", async function () {
    var result = await callTool(mcpServer, "cancel_job", {
      job_id: "job-aborted"
    });
    expect(result.isError).to.not.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).to.be.true;
    expect(parsed.message).to.equal("Job already cancelled");
  });

  it("returns isError when torque_id cannot be parsed", async function () {
    var result = await callTool(mcpServer, "cancel_job", {
      job_id: "job-bad-torque"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.include("scheduler job ID");
  });
});

// =====================================================================
// Suite 6: tools – spawn_analysis
// =====================================================================
describe("MCP tools – spawn_analysis", function () {
  var mcpServer;
  var mockRedis;
  var originalSpawnAnalysis;

  before(async function () {
    mockRedis = createMockRedis({});
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    // Stub spawnAnalysis to avoid needing real constructors/filesystem
    originalSpawnAnalysis = spawnHelpers.spawnAnalysis;
    spawnHelpers.spawnAnalysis = function (type) {
      if (!spawnHelpers.analysisMap[type]) {
        throw new Error("Unknown analysis type: " + type);
      }
      return "deadbeef1234";
    };

    registerTools(mcpServer, mockRedis);
  });

  after(function () {
    spawnHelpers.spawnAnalysis = originalSpawnAnalysis;
  });

  it("returns job_id and analysis_type on success", async function () {
    var result = await callTool(mcpServer, "spawn_analysis", {
      analysis_type: "fel",
      alignment: ">seq1\nATGATG\n>seq2\nATGCTG"
    });
    expect(result.isError).to.not.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.job_id).to.equal("deadbeef1234");
    expect(parsed.analysis_type).to.equal("fel");
  });

  it("returns isError for alignment with single sequence", async function () {
    var result = await callTool(mcpServer, "spawn_analysis", {
      analysis_type: "absrel",
      alignment: ">seq1\nATG"
    });
    // Validation now rejects single-sequence alignments
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.include("Alignment validation failed");
  });
});

// =====================================================================
// Suite 7: Prompts
// =====================================================================
describe("MCP prompts", function () {
  var mcpServer;

  before(function () {
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { prompts: {} } }
    );
    registerPrompts(mcpServer);
  });

  it("registers all 4 prompts", function () {
    var names = Object.keys(mcpServer._registeredPrompts);
    expect(names).to.include("choose-method");
    expect(names).to.include("run-busted");
    expect(names).to.include("run-relax");
    expect(names).to.include("interpret-results");
    expect(names).to.have.lengthOf(4);
  });

  it("choose-method returns messages array with method guidance", async function () {
    var prompt = mcpServer._registeredPrompts["choose-method"];
    var result = await prompt.callback({});
    expect(result).to.have.property("messages").that.is.an("array");
    expect(result.messages.length).to.be.greaterThan(0);
    var text = result.messages[0].content.text;
    expect(text).to.include("BUSTED");
    expect(text).to.include("RELAX");
    expect(text).to.include("FEL");
  });

  it("run-busted mentions p-value and foreground branches", async function () {
    var prompt = mcpServer._registeredPrompts["run-busted"];
    var result = await prompt.callback({ has_foreground_branches: "yes" });
    var text = result.messages[0].content.text;
    expect(text).to.include("p-value");
    expect(text).to.include("foreground");
  });

  it("run-relax mentions TEST and REFERENCE labels", async function () {
    var prompt = mcpServer._registeredPrompts["run-relax"];
    var result = await prompt.callback({
      test_branch_label: "TEST",
      reference_branch_label: "REFERENCE"
    });
    var text = result.messages[0].content.text;
    expect(text).to.include("TEST");
    expect(text).to.include("REFERENCE");
    expect(text).to.include("relax");
  });

  it("interpret-results returns method-specific guidance", async function () {
    var prompt = mcpServer._registeredPrompts["interpret-results"];
    var result = await prompt.callback({ method: "busted" });
    var text = result.messages[0].content.text;
    expect(text).to.include("BUSTED");
    expect(text).to.include("p-value");
  });
});

// =====================================================================
// Suite 8: Resources
// =====================================================================
describe("MCP resources", function () {
  var mcpServer;

  before(function () {
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { resources: {} } }
    );
    registerResources(mcpServer);
  });

  it("registers static resources", function () {
    var uris = Object.keys(mcpServer._registeredResources);
    expect(uris).to.include("datamonkey://methods/comparison");
    expect(uris).to.include("datamonkey://methods/requirements");
  });

  it("comparison resource returns markdown table", async function () {
    var resource = mcpServer._registeredResources["datamonkey://methods/comparison"];
    var result = await resource.readCallback(new URL("datamonkey://methods/comparison"), {});
    expect(result.contents).to.be.an("array").with.lengthOf(1);
    var text = result.contents[0].text;
    expect(text).to.include("aBSREL");
    expect(text).to.include("BUSTED");
    expect(text).to.include("HIV-TRACE");
  });

  it("requirements resource returns JSON with 18 methods", async function () {
    var resource = mcpServer._registeredResources["datamonkey://methods/requirements"];
    var result = await resource.readCallback(new URL("datamonkey://methods/requirements"), {});
    var parsed = JSON.parse(result.contents[0].text);
    expect(Object.keys(parsed)).to.have.lengthOf(18);
    expect(parsed.relax.requires_branch_labels).to.be.true;
    expect(parsed.hivtrace.requires_codon_alignment).to.be.false;
  });

  it("registers method-guide resource template", function () {
    var templates = Object.keys(mcpServer._registeredResourceTemplates);
    expect(templates).to.have.lengthOf(1);
    expect(templates[0]).to.equal("method-guide");
  });

  it("method-guide template returns guide for known method", async function () {
    var template = mcpServer._registeredResourceTemplates["method-guide"];
    var result = await template.readCallback(
      new URL("datamonkey://methods/busted/guide"),
      { method_name: "busted" }
    );
    expect(result.contents).to.be.an("array").with.lengthOf(1);
    var text = result.contents[0].text;
    expect(text).to.include("BUSTED");
    expect(text).to.include("spawn_analysis");
  });

  it("method-guide template handles unknown method gracefully", async function () {
    var template = mcpServer._registeredResourceTemplates["method-guide"];
    var result = await template.readCallback(
      new URL("datamonkey://methods/nonexistent/guide"),
      { method_name: "nonexistent" }
    );
    var text = result.contents[0].text;
    expect(text).to.include("Unknown method");
  });
});

// =====================================================================
// Suite 9: Validation
// =====================================================================
describe("MCP validation", function () {

  it("parseFasta parses valid FASTA", function () {
    var fasta = ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n";
    var seqs = validation.parseFasta(fasta);
    expect(seqs).to.have.lengthOf(2);
    expect(seqs[0].name).to.equal("seq1");
    expect(seqs[0].seq).to.equal("ATGATGATG");
  });

  it("validateAlignment passes for valid codon-aligned FASTA", function () {
    var fasta = ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n";
    var result = validation.validateAlignment(fasta);
    expect(result.valid).to.be.true;
    expect(result.sequence_count).to.equal(2);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("validateAlignment warns for non-codon-frame sequences", function () {
    var fasta = ">seq1\nATGATGA\n>seq2\nATGCTGA\n";
    var result = validation.validateAlignment(fasta);
    // Still valid at alignment level (warning, not error)
    expect(result.valid).to.be.true;
    expect(result.warnings.length).to.be.greaterThan(0);
    expect(result.warnings[0]).to.include("not divisible by 3");
  });

  it("checkStopCodons detects internal stop codons", function () {
    var seqs = [{ name: "seq1", seq: "ATGTAAATG" }]; // TAA at position 4
    var result = validation.checkStopCodons(seqs);
    expect(result.warnings.length).to.be.greaterThan(0);
    expect(result.warnings[0]).to.include("internal stop codon");
  });

  it("validateAnalysisParams fails for RELAX without branch labels", function () {
    var result = validation.validateAnalysisParams("relax", "((A:0.1,B:0.2):0.3,C:0.4);", {});
    expect(result.valid).to.be.false;
    expect(result.errors[0]).to.include("TEST");
    expect(result.errors[0]).to.include("REFERENCE");
  });

  it("validateAnalysisParams passes for RELAX with proper labels", function () {
    var tree = "((A:0.1,B:0.2){TEST}:0.3,(C:0.1,D:0.2){REFERENCE}:0.3);";
    var result = validation.validateAnalysisParams("relax", tree, {});
    expect(result.valid).to.be.true;
    expect(result.errors).to.have.lengthOf(0);
  });

  it("validateAnalysisParams fails for Contrast-FEL with <2 groups", function () {
    var tree = "((A:0.1,B:0.2){Group1}:0.3,C:0.4);";
    var result = validation.validateAnalysisParams("cfel", tree, {});
    expect(result.valid).to.be.false;
    expect(result.errors[0]).to.include("2 distinct branch group labels");
  });

  it("validateAnalysisParams passes for Contrast-FEL with ≥2 groups", function () {
    var tree = "((A:0.1,B:0.2){Group1}:0.3,(C:0.1,D:0.2){Group2}:0.3);";
    var result = validation.validateAnalysisParams("cfel", tree, {});
    expect(result.valid).to.be.true;
  });

  it("validateAnalysisParams passes for BUSTED with no branches (warning only)", function () {
    var result = validation.validateAnalysisParams("busted", "((A:0.1,B:0.2):0.3,C:0.4);", {});
    expect(result.valid).to.be.true;
    expect(result.warnings.length).to.be.greaterThan(0);
    expect(result.warnings[0]).to.include("foreground");
  });

  it("validateAlignment fails for empty input", function () {
    var result = validation.validateAlignment("");
    expect(result.valid).to.be.false;
    expect(result.errors[0]).to.include("empty");
  });

  it("validateAlignment fails for single sequence", function () {
    var result = validation.validateAlignment(">seq1\nATGATGATG\n");
    expect(result.valid).to.be.false;
    expect(result.errors[0]).to.include("at least 2");
  });

  it("extractBranchLabels extracts labels from Newick tree", function () {
    var labels = validation.extractBranchLabels("((A,B){TEST},(C,D){REFERENCE});");
    expect(labels).to.include("TEST");
    expect(labels).to.include("REFERENCE");
    expect(labels).to.have.lengthOf(2);
  });
});

// =====================================================================
// Suite 10: tools – validate_alignment
// =====================================================================
describe("MCP tools – validate_alignment", function () {
  var mcpServer;
  var mockRedis;

  before(function () {
    mockRedis = createMockRedis({});
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    registerTools(mcpServer, mockRedis);
  });

  it("returns valid for good codon-aligned FASTA", async function () {
    var result = await callTool(mcpServer, "validate_alignment", {
      alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n"
    });
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.valid).to.be.true;
    expect(parsed.sequence_count).to.equal(2);
  });

  it("returns isError for non-codon-frame with codon method", async function () {
    var result = await callTool(mcpServer, "validate_alignment", {
      alignment: ">seq1\nATGATGA\n>seq2\nATGCTGA\n",
      analysis_type: "fel"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.valid).to.be.false;
    expect(parsed.errors.length).to.be.greaterThan(0);
  });

  it("returns isError for RELAX with untagged tree", async function () {
    var result = await callTool(mcpServer, "validate_alignment", {
      alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n",
      analysis_type: "relax",
      tree: "((A:0.1,B:0.2):0.3,C:0.4);"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.errors.length).to.be.greaterThan(0);
    expect(parsed.errors[0]).to.include("TEST");
  });
});

// =====================================================================
// Suite 11: tools – spawn_analysis with validation
// =====================================================================
describe("MCP tools – spawn_analysis with validation", function () {
  var mcpServer;
  var mockRedis;
  var originalSpawnAnalysis;

  before(function () {
    mockRedis = createMockRedis({});
    mcpServer = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    originalSpawnAnalysis = spawnHelpers.spawnAnalysis;
    spawnHelpers.spawnAnalysis = function (type) {
      if (!spawnHelpers.analysisMap[type]) {
        throw new Error("Unknown analysis type: " + type);
      }
      return "deadbeef5678";
    };

    registerTools(mcpServer, mockRedis);
  });

  after(function () {
    spawnHelpers.spawnAnalysis = originalSpawnAnalysis;
  });

  it("rejects RELAX with untagged tree", async function () {
    var result = await callTool(mcpServer, "spawn_analysis", {
      analysis_type: "relax",
      alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n",
      tree: "((A:0.1,B:0.2):0.3,C:0.4);"
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.include("Parameter validation failed");
  });

  it("includes warnings for BUSTED without foreground branches", async function () {
    var result = await callTool(mcpServer, "spawn_analysis", {
      analysis_type: "busted",
      alignment: ">seq1\nATGATGATG\n>seq2\nATGCTGATG\n",
      tree: "((A:0.1,B:0.2):0.3,C:0.4);"
    });
    expect(result.isError).to.not.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.job_id).to.equal("deadbeef5678");
    expect(parsed.warnings).to.be.an("array");
    expect(parsed.warnings.length).to.be.greaterThan(0);
  });

  it("rejects empty alignment", async function () {
    var result = await callTool(mcpServer, "spawn_analysis", {
      analysis_type: "fel",
      alignment: ""
    });
    expect(result.isError).to.be.true;
    var parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).to.include("Alignment validation failed");
  });
});
