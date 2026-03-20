var EventEmitter = require("events").EventEmitter,
  crypto = require("crypto"),
  absrel = require("../../app/absrel/absrel.js"),
  bgm = require("../../app/bgm/bgm.js"),
  busted = require("../../app/busted/busted.js"),
  difFubar = require("../../app/difFubar/difFubar.js"),
  fel = require("../../app/fel/fel.js"),
  cfel = require("../../app/contrast-fel/cfel.js"),
  flea = require("../../app/flea/flea.js"),
  fubar = require("../../app/fubar/fubar.js"),
  bstill = require("../../app/bstill/bstill.js"),
  fade = require("../../app/fade/fade.js"),
  gard = require("../../app/gard/gard.js"),
  hivtrace = require("../../app/hivtrace/hivtrace.js"),
  meme = require("../../app/meme/meme.js"),
  multihit = require("../../app/multihit/multihit.js"),
  nrm = require("../../app/nrm/nrm.js"),
  prime = require("../../app/prime/prime.js"),
  relax = require("../../app/relax/relax.js"),
  slac = require("../../app/slac/slac.js"),
  logger = require("../logger.js").logger;

// Map of analysis type to constructor
var analysisMap = {
  absrel:    absrel.absrel,
  bgm:       bgm.bgm,
  busted:    busted.busted,
  difFubar:  difFubar.difFubar,
  fel:       fel.fel,
  cfel:      cfel.cfel,
  flea:      flea.flea,
  fubar:     fubar.fubar,
  bstill:    bstill.bstill,
  fade:      fade.fade,
  gard:      gard.gard,
  hivtrace:  hivtrace.hivtrace,
  meme:      meme.meme,
  multihit:  multihit.multihit,
  nrm:       nrm.nrm,
  prime:     prime.prime,
  relax:     relax.relax,
  slac:      slac.slac
};

// Analysis metadata for list_analyses
var analysisInfo = {
  absrel: {
    name: "aBSREL",
    description: "Adaptive Branch-Site REL test for episodic diversification",
    params: ["branches", "multiple_hits", "srv"]
  },
  bgm: {
    name: "BGM",
    description: "Bayesian Graphical Model for detecting coevolving sites",
    params: []
  },
  busted: {
    name: "BUSTED",
    description: "Branch-site Unrestricted Statistical Test for Episodic Diversification",
    params: ["branches", "ds_variation", "error_protection", "rates", "syn_rates"]
  },
  difFubar: {
    name: "Differential FUBAR",
    description: "Test for differential selection between two groups of branches",
    params: []
  },
  fel: {
    name: "FEL",
    description: "Fixed Effects Likelihood test for pervasive selection at individual sites",
    params: ["branches", "multiple_hits", "bootstrap", "ci", "ds_variation"]
  },
  cfel: {
    name: "Contrast-FEL",
    description: "Test for differences in selective pressures between groups of branches",
    params: ["branches"]
  },
  flea: {
    name: "FLEA",
    description: "FLAvors of Evolution Analysis",
    params: []
  },
  fubar: {
    name: "FUBAR",
    description: "Fast Unconstrained Bayesian AppRoximation for detecting selection",
    params: []
  },
  bstill: {
    name: "B-STILL",
    description: "Bayesian STructural Inference of Lineage Localization",
    params: []
  },
  fade: {
    name: "FADE",
    description: "FUBAR Approach to Directional Evolution",
    params: ["branches"]
  },
  gard: {
    name: "GARD",
    description: "Genetic Algorithm for Recombination Detection",
    params: []
  },
  hivtrace: {
    name: "HIV-TRACE",
    description: "HIV TRAnsmission Cluster Engine for molecular epidemiology",
    params: ["distance_threshold", "ambiguity_handling", "fraction", "reference", "filter_edges", "min_overlap"]
  },
  meme: {
    name: "MEME",
    description: "Mixed Effects Model of Evolution for episodic site-level selection",
    params: ["branches", "multiple_hits"]
  },
  multihit: {
    name: "MULTIHIT",
    description: "Test for multi-nucleotide substitutions",
    params: ["branches"]
  },
  nrm: {
    name: "NRM",
    description: "Nucleotide Rate Model",
    params: []
  },
  prime: {
    name: "PRIME",
    description: "Property Informed Models of Evolution",
    params: ["branches"]
  },
  relax: {
    name: "RELAX",
    description: "Test for relaxation or intensification of selection",
    params: ["branches"]
  },
  slac: {
    name: "SLAC",
    description: "Single Likelihood Ancestor Counting for detecting selection",
    params: ["branches", "bootstrap"]
  }
};

/**
 * Create a stub socket (EventEmitter) that captures events
 * but doesn't forward to any WebSocket client. The job still
 * writes to Redis normally.
 */
function createStubSocket() {
  var stub = new EventEmitter();
  stub.id = "mcp-" + crypto.randomBytes(8).toString("hex");
  stub.emit = function(event) {
    // Allow internal EventEmitter events, but log socket.io style emits
    if (event === "error") {
      // Let EventEmitter handle error events normally
      return EventEmitter.prototype.emit.apply(stub, arguments);
    }
    logger.info("MCP stub socket emit: " + event);
    return EventEmitter.prototype.emit.apply(stub, arguments);
  };
  stub.disconnect = function() {};
  return stub;
}

/**
 * Spawn an analysis job via the existing constructors.
 * Returns the job ID.
 *
 * @param {string} type - Analysis type key (e.g., "fel", "absrel")
 * @param {string} alignment - Alignment data (FASTA/Nexus string)
 * @param {string|null} tree - Newick tree string (optional)
 * @param {object} analysisParams - Additional analysis-specific parameters
 * @returns {string} job_id
 */
function spawnAnalysis(type, alignment, tree, analysisParams) {
  var Constructor = analysisMap[type];
  if (!Constructor) {
    throw new Error("Unknown analysis type: " + type);
  }

  var socket = createStubSocket();
  var jobId = crypto.randomBytes(12).toString("hex");

  // Build the params object matching what the server.js routing provides.
  // Most analyses expect: { analysis: { _id, ...opts }, msa: [{gencodeid}], tree }
  // hivtrace is special: it uses params._id directly.
  if (type === "hivtrace") {
    var params = Object.assign({ _id: jobId }, analysisParams || {});
    new Constructor(socket, alignment, params);
  } else {
    var params = {
      analysis: Object.assign({ _id: jobId }, analysisParams || {}),
      msa: [{ gencodeid: (analysisParams && analysisParams.gencodeid) || 0 }]
    };
    if (tree) {
      params.tree = tree;
    }
    if (analysisParams && analysisParams.genetic_code) {
      params.genetic_code = analysisParams.genetic_code;
    }
    new Constructor(socket, alignment, params);
  }

  return jobId;
}

exports.spawnAnalysis = spawnAnalysis;
exports.analysisInfo = analysisInfo;
exports.analysisMap = analysisMap;
