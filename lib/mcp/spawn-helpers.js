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
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test (e.g. 'All', 'Internal', 'Leaves', or 'FG' for labeled foreground)" },
      multiple_hits: { type: "string", default: "None", description: "Multiple hits model: 'None', 'Double', or 'Double+Triple'" },
      srv: { type: "string", default: "Yes", description: "Synonymous rate variation: 'Yes' or 'No'" }
    }
  },
  bgm: {
    name: "BGM",
    description: "Bayesian Graphical Model for detecting coevolving sites",
    params: {
      length_of_each_chain: { type: "number", default: 1000000, description: "Number of MCMC steps per chain" },
      number_of_burn_in_samples: { type: "number", default: 100000, description: "Number of burn-in samples to discard" },
      number_of_samples: { type: "number", default: 100, description: "Number of posterior samples to draw" },
      maximum_parents_per_node: { type: "number", default: 1, description: "Maximum number of parent nodes in the graphical model" },
      minimum_subs_per_site: { type: "number", default: 1, description: "Minimum substitutions per site to include" },
      branches: { type: "string", default: "All", description: "Which branches to include" }
    }
  },
  busted: {
    name: "BUSTED",
    description: "Branch-site Unrestricted Statistical Test for Episodic Diversification",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test (e.g. 'All' or 'FG' for labeled foreground)" },
      ds_variation: { type: "number", default: 2, description: "Synonymous rate variation classes (0=none, 1=general discrete, 2=general discrete)" },
      error_protection: { type: "boolean", default: false, description: "Enable error sink for misalignment protection" },
      rates: { type: "number", default: 3, description: "Number of omega rate classes" },
      syn_rates: { type: "number", default: 3, description: "Number of synonymous rate classes" }
    }
  },
  difFubar: {
    name: "Differential FUBAR",
    description: "Test for differential selection between two groups of branches",
    params: {
      number_of_grid_points: { type: "number", description: "Number of grid points for the Bayesian analysis" },
      concentration_of_dirichlet_prior: { type: "number", description: "Concentration parameter for the Dirichlet prior" },
      mcmc_iterations: { type: "number", description: "Number of MCMC iterations" },
      burnin_samples: { type: "number", description: "Number of burn-in samples to discard" },
      pos_threshold: { type: "number", description: "Posterior probability threshold for significance" }
    }
  },
  fel: {
    name: "FEL",
    description: "Fixed Effects Likelihood test for pervasive selection at individual sites",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test (e.g. 'All', 'Internal', 'Leaves')" },
      multiple_hits: { type: "string", default: "None", description: "Multiple hits model: 'None', 'Double', or 'Double+Triple'" },
      bootstrap: { type: "boolean", default: false, description: "Perform parametric bootstrap resampling" },
      ci: { type: "boolean", default: false, description: "Compute confidence intervals for rate estimates" },
      ds_variation: { type: "boolean", default: false, description: "Allow synonymous rate variation across sites" }
    }
  },
  cfel: {
    name: "Contrast-FEL",
    description: "Test for differences in selective pressures between groups of branches",
    params: {
      branch_sets: { type: "array", description: "Branch group labels to contrast (requires ≥2 groups labeled in tree, e.g. ['Group1', 'Group2'])" },
      p_value: { type: "number", default: 0.05, description: "P-value threshold for significance" },
      q_value: { type: "number", default: 0.20, description: "Q-value threshold for false discovery rate" },
      srv: { type: "string", default: "Yes", description: "Synonymous rate variation: 'Yes' or 'No'" },
      permutations: { type: "string", default: "Yes", description: "Perform permutation testing: 'Yes' or 'No'" }
    }
  },
  flea: {
    name: "FLEA",
    description: "FLAvors of Evolution Analysis",
    params: {}
  },
  fubar: {
    name: "FUBAR",
    description: "Fast Unconstrained Bayesian AppRoximation for detecting selection",
    params: {
      number_of_grid_points: { type: "number", default: 20, description: "Number of grid points for the Bayesian analysis" },
      concentration_of_dirichlet_prior: { type: "number", default: 0.5, description: "Concentration parameter for the Dirichlet prior" }
    }
  },
  bstill: {
    name: "B-STILL",
    description: "Bayesian STructural Inference of Lineage Localization",
    params: {}
  },
  fade: {
    name: "FADE",
    description: "FUBAR Approach to Directional Evolution",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test" },
      model: { type: "string", default: "LG", description: "Amino acid substitution model (e.g. 'LG', 'WAG', 'JTT')" },
      method: { type: "string", default: "Metropolis-Hastings", description: "Posterior estimation method: 'Metropolis-Hastings' or 'Collapsed Gibbs'" },
      number_of_grid_points: { type: "number", default: 20, description: "Number of grid points for the Bayesian analysis" },
      number_of_mcmc_chains: { type: "number", default: 5, description: "Number of MCMC chains to run" },
      length_of_each_chain: { type: "number", default: 1000000, description: "Number of MCMC steps per chain" },
      number_of_burn_in_samples: { type: "number", default: 100000, description: "Number of burn-in samples to discard" },
      number_of_samples: { type: "number", default: 100, description: "Number of posterior samples to draw" },
      concentration_of_dirichlet_prior: { type: "number", default: 0.5, description: "Concentration parameter for the Dirichlet prior" }
    }
  },
  gard: {
    name: "GARD",
    description: "Genetic Algorithm for Recombination Detection",
    params: {
      site_to_site_variation: { type: "string", default: "none", description: "Site-to-site rate variation model: 'none', 'general_discrete', or 'beta_gamma'" },
      rate_classes: { type: "number", default: 2, description: "Number of rate classes (when rate variation is enabled)" },
      run_mode: { type: "string", default: "Normal", description: "Search mode: 'Normal' or 'Faster'" },
      max_breakpoints: { type: "number", default: 10000, description: "Maximum number of breakpoints to consider" }
    }
  },
  hivtrace: {
    name: "HIV-TRACE",
    description: "HIV TRAnsmission Cluster Engine for molecular epidemiology",
    params: {
      distance_threshold: { type: "number", description: "Genetic distance threshold for clustering (e.g. 0.015)" },
      ambiguity_handling: { type: "string", description: "How to handle ambiguous nucleotides: 'average', 'resolve', or 'skip'" },
      fraction: { type: "number", description: "Fraction of sequence to use for pairwise distance calculation" },
      reference: { type: "string", description: "Reference sequence ID for coordinate mapping" },
      filter_edges: { type: "string", description: "Edge filtering strategy" },
      min_overlap: { type: "number", description: "Minimum overlap between sequences for pairwise comparison" },
      lanl_compare: { type: "boolean", description: "Compare against LANL HIV database" },
      strip_drams: { type: "string", description: "Strip drug resistance associated mutations: 'yes' or 'no'" }
    }
  },
  meme: {
    name: "MEME",
    description: "Mixed Effects Model of Evolution for episodic site-level selection",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test" },
      multiple_hits: { type: "string", default: "None", description: "Multiple hits model: 'None', 'Double', or 'Double+Triple'" },
      p_value: { type: "number", default: 0.1, description: "P-value threshold for significance" },
      rates: { type: "number", default: 2, description: "Number of omega rate classes at each site" },
      resample: { type: "number", default: 0, description: "Number of bootstrap resamples (0 = no resampling)" }
    }
  },
  multihit: {
    name: "MULTIHIT",
    description: "Test for multi-nucleotide substitutions",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test" },
      rate_classes: { type: "number", default: 1, description: "Number of rate classes" },
      triple_islands: { type: "string", default: "No", description: "Include triple-island model: 'Yes' or 'No'" }
    }
  },
  nrm: {
    name: "NRM",
    description: "Nucleotide Rate Model",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test" }
    }
  },
  prime: {
    name: "PRIME",
    description: "Property Informed Models of Evolution",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test" },
      property_set: { type: "string", default: "5PROP", description: "Property set: '5PROP' (Atchley) or 'LCAP' (Conant-Stadler)" },
      pvalue: { type: "number", default: 0.1, description: "P-value threshold for significance" },
      impute_states: { type: "string", default: "No", description: "Impute ancestral states: 'Yes' or 'No'" }
    }
  },
  relax: {
    name: "RELAX",
    description: "Test for relaxation or intensification of selection",
    params: {
      mode: { type: "string", default: "Classic mode", description: "Analysis mode: 'Classic mode' or 'All'" },
      test: { type: "string", default: "TEST", description: "Label for test branches in the tree (requires {TEST} labels)" },
      reference: { type: "string", default: "REFERENCE", description: "Label for reference branches in the tree (requires {REFERENCE} labels)" },
      models: { type: "string", default: "All", description: "Which models to fit: 'All' or specific model" },
      rates: { type: "number", default: 3, description: "Number of omega rate classes" }
    }
  },
  slac: {
    name: "SLAC",
    description: "Single Likelihood Ancestor Counting for detecting selection",
    params: {
      branches: { type: "string", default: "All", description: "Which branches to test" },
      p_value: { type: "number", default: 0.1, description: "P-value threshold for significance" }
    }
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
    // If no tree provided, try to extract from NEXUS TREES block
    if (!tree && alignment && alignment.indexOf("#NEXUS") !== -1) {
      var treeMatch = alignment.match(/TREE\s+\w+\s*=\s*(.+);/i);
      if (treeMatch) {
        tree = treeMatch[1].trim();
      }
    }
    params.tree = tree || "";
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
