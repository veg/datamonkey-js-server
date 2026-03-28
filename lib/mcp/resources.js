/**
 * MCP Resources — static and template resources for method documentation.
 */

var ResourceTemplate = require("@modelcontextprotocol/sdk/server/mcp.js").ResourceTemplate;

var METHOD_KEYS = [
  "absrel", "bgm", "busted", "difFubar", "fel", "cfel", "flea",
  "fubar", "bstill", "fade", "gard", "hivtrace", "meme", "multihit",
  "nrm", "prime", "relax", "slac"
];

var METHOD_REQUIREMENTS = {
  absrel: {
    name: "aBSREL", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "{FG} for foreground (optional)",
    description: "Adaptive Branch-Site REL — tests each branch for episodic diversifying selection"
  },
  bgm: {
    name: "BGM", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "none",
    description: "Bayesian Graphical Model — detects coevolving sites"
  },
  busted: {
    name: "BUSTED", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "{FG} for foreground (optional)",
    description: "Branch-site Unrestricted Statistical Test for Episodic Diversification"
  },
  difFubar: {
    name: "Differential FUBAR", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: true, branch_label_convention: "≥2 group labels required (e.g., {Group1}, {Group2})",
    description: "Tests for differential selection between two groups of branches"
  },
  fel: {
    name: "FEL", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "optional branch set",
    description: "Fixed Effects Likelihood — tests each site for pervasive selection"
  },
  cfel: {
    name: "Contrast-FEL", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: true, branch_label_convention: "≥2 group labels required (e.g., {Group1}, {Group2})",
    description: "Tests for differences in selective pressures between groups of branches"
  },
  flea: {
    name: "FLEA", requires_tree: true, requires_codon_alignment: false,
    requires_branch_labels: false, branch_label_convention: "none",
    description: "FLAvors of Evolution Analysis for longitudinal data"
  },
  fubar: {
    name: "FUBAR", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "none",
    description: "Fast Unconstrained Bayesian AppRoximation — Bayesian site-level selection"
  },
  bstill: {
    name: "B-STILL", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "none",
    description: "Bayesian STructural Inference of Lineage Localization"
  },
  fade: {
    name: "FADE", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "optional branch set",
    description: "FUBAR Approach to Directional Evolution"
  },
  gard: {
    name: "GARD", requires_tree: false, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "none",
    description: "Genetic Algorithm for Recombination Detection"
  },
  hivtrace: {
    name: "HIV-TRACE", requires_tree: false, requires_codon_alignment: false,
    requires_branch_labels: false, branch_label_convention: "none",
    description: "HIV TRAnsmission Cluster Engine — molecular epidemiology"
  },
  meme: {
    name: "MEME", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "optional branch set",
    description: "Mixed Effects Model of Evolution — episodic site-level selection"
  },
  multihit: {
    name: "MULTIHIT", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "optional branch set",
    description: "Tests for multi-nucleotide substitutions"
  },
  nrm: {
    name: "NRM", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "none",
    description: "Nucleotide Rate Model"
  },
  prime: {
    name: "PRIME", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "optional branch set",
    description: "Property Informed Models of Evolution"
  },
  relax: {
    name: "RELAX", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: true, branch_label_convention: "{TEST} and {REFERENCE} required",
    description: "Tests for relaxation or intensification of selection"
  },
  slac: {
    name: "SLAC", requires_tree: true, requires_codon_alignment: true,
    requires_branch_labels: false, branch_label_convention: "optional branch set",
    description: "Single Likelihood Ancestor Counting — counting-based selection detection"
  }
};

// Per-method detailed guides
var METHOD_GUIDES = {
  absrel:
"# aBSREL — Adaptive Branch-Site REL\n\n" +
"## Purpose\nTests each branch in a phylogeny for episodic diversifying selection. " +
"Unlike branch-level tests that average over sites, aBSREL allows selection to vary across sites AND branches.\n\n" +
"## Inputs\n" +
"- **Alignment**: Codon-aligned FASTA or NEXUS (sequence length must be divisible by 3)\n" +
"- **Tree**: Newick format (recommended). Optional {FG} labels for foreground branches.\n\n" +
"## Parameters\n" +
"- `branches`: Which branches to test. Options: \"All\", \"Internal\", \"Leaves\", or \"FG\" if labeled. Default: All\n" +
"- `multiple_hits`: Allow multiple hits per codon. Options: \"None\", \"Double\", \"Double+Triple\". Default: None\n" +
"- `srv`: Synonymous rate variation. Default: no\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"absrel\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"((A:0.1,B:0.2){FG}:0.3,C:0.4);\",\n  \"params\": { \"branches\": \"FG\" }\n}\n```\n\n" +
"## Interpretation\n- Check `branch attributes` → `Corrected P-value` for each branch\n- p < 0.05 after Holm-Bonferroni correction: evidence of selection on that branch",

  busted:
"# BUSTED — Branch-Site Unrestricted Statistical Test\n\n" +
"## Purpose\nTests whether a gene has experienced episodic positive/diversifying selection at any site on any branch (or a subset of branches).\n\n" +
"## Inputs\n" +
"- **Alignment**: Codon-aligned FASTA or NEXUS\n" +
"- **Tree**: Newick format. Optional {FG} labels for foreground branches.\n\n" +
"## Parameters\n" +
"- `branches`: \"All\" or \"FG\". Default: All\n" +
"- `ds_variation`: Model synonymous rate variation (\"Yes\"/\"No\"). Default: No\n" +
"- `error_protection`: Use BUSTED-E for error-protected inference (\"Yes\"/\"No\"). Default: No\n" +
"- `rates`: Number of omega rate classes (2-5). Default: 3\n" +
"- `syn_rates`: Number of synonymous rate classes (1-5). Default: 3\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"busted\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"((A:0.1,B:0.2){FG}:0.3,C:0.4);\",\n  \"params\": { \"branches\": \"FG\", \"error_protection\": \"Yes\" }\n}\n```\n\n" +
"## Interpretation\n- `test results` → `p-value` < 0.05: gene-wide evidence of selection\n- `Evidence Ratios` per site: site-level evidence (not a formal test)",

  fel:
"# FEL — Fixed Effects Likelihood\n\n" +
"## Purpose\nTests each site for pervasive (constant across time) positive or purifying selection.\n\n" +
"## Inputs\n" +
"- **Alignment**: Codon-aligned FASTA or NEXUS\n" +
"- **Tree**: Newick format\n\n" +
"## Parameters\n" +
"- `branches`: Which branches to include. Default: All\n" +
"- `multiple_hits`: \"None\", \"Double\", \"Double+Triple\". Default: None\n" +
"- `ci`: Compute confidence intervals. Default: No\n" +
"- `ds_variation`: Synonymous rate variation. Default: No\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"fel\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Per-site p-value < 0.1: evidence of selection\n- beta > alpha: positive selection; beta < alpha: purifying selection",

  relax:
"# RELAX — Test for Relaxation/Intensification of Selection\n\n" +
"## Purpose\nTests whether selection has been relaxed or intensified on test branches relative to reference branches.\n\n" +
"## Inputs\n" +
"- **Alignment**: Codon-aligned FASTA or NEXUS\n" +
"- **Tree**: Newick with **mandatory** {TEST} and {REFERENCE} branch labels\n\n" +
"## Parameters\n" +
"- `branches`: Automatically uses TEST vs REFERENCE from tree labels\n\n" +
"## CRITICAL: Tree must have branch labels\n```\n((seq1:0.1,seq2:0.2){TEST}:0.3,(seq3:0.1,seq4:0.2){REFERENCE}:0.3);\n```\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"relax\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"((A:0.1,B:0.2){TEST}:0.3,(C:0.1,D:0.2){REFERENCE}:0.3);\"\n}\n```\n\n" +
"## Interpretation\n- K > 1: selection intensified; K < 1: selection relaxed\n- p-value < 0.05: significant",

  meme:
"# MEME — Mixed Effects Model of Evolution\n\n" +
"## Purpose\nDetects episodic positive selection at individual sites — selection that may act on only a subset of branches.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\n- `branches`: Which branches. Default: All\n- `multiple_hits`: Allow multi-nucleotide changes. Default: None\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"meme\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- p-value < 0.1: evidence of episodic positive selection at that site\n- More powerful than FEL for detecting transient/episodic selection",

  slac:
"# SLAC — Single Likelihood Ancestor Counting\n\n" +
"## Purpose\nFast, conservative counting-based method for detecting selection at individual sites.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\n- `branches`: Which branches. Default: All\n- `bootstrap`: Number of bootstrap replicates. Default: 100\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"slac\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- p-value < 0.1: evidence of selection\n- Most conservative of the site-level methods; best with >50 sequences",

  fubar:
"# FUBAR — Fast Unconstrained Bayesian AppRoximation\n\n" +
"## Purpose\nBayesian method for detecting pervasive site-level selection. Faster than FEL.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\nNo additional parameters.\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"fubar\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Posterior probability > 0.9: strong evidence of selection at that site\n- Uses Bayes factors rather than p-values",

  gard:
"# GARD — Genetic Algorithm for Recombination Detection\n\n" +
"## Purpose\nScreens alignments for evidence of recombination by detecting phylogenetic incongruence.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Not required (GARD infers its own trees)\n\n" +
"## Parameters\nNo additional parameters.\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"gard\",\n  \"alignment\": \"<FASTA>\"\n}\n```\n\n" +
"## Interpretation\n- Breakpoints with KH test p < 0.05: significant topological incongruence\n- Run before other selection analyses to check for recombination",

  cfel:
"# Contrast-FEL\n\n" +
"## Purpose\nTests whether selection at individual sites differs between predefined groups of branches.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick with ≥2 branch group labels (e.g., {Group1}, {Group2})\n\n" +
"## Parameters\n- `branches`: Uses groups from tree labels\n\n" +
"## CRITICAL: Tree must have ≥2 group labels\n```\n((A:0.1,B:0.2){Group1}:0.3,(C:0.1,D:0.2){Group2}:0.3);\n```\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"cfel\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"((A:0.1,B:0.2){Group1}:0.3,(C:0.1,D:0.2){Group2}:0.3);\"\n}\n```\n\n" +
"## Interpretation\n- Per-site p-value < 0.05: significant difference in selection between groups",

  multihit:
"# MULTIHIT — Multi-Nucleotide Substitution Test\n\n" +
"## Purpose\nTests whether multi-nucleotide (instantaneous) substitutions improve model fit.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\n- `branches`: Which branches. Default: All\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"multihit\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Compare AIC between single-hit and multi-hit models\n- Lower AIC = better fit",

  fade:
"# FADE — FUBAR Approach to Directional Evolution\n\n" +
"## Purpose\nDetects sites evolving toward a specific amino acid (directional selection).\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\n- `branches`: Which branches to test. Default: All\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"fade\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Bayes factor > 100: strong evidence for directional evolution at that site\n- Identifies the target amino acid",

  bgm:
"# BGM — Bayesian Graphical Model\n\n" +
"## Purpose\nDetects coevolving (epistatically interacting) pairs of sites.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\nNo additional parameters.\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"bgm\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Posterior probability > 0.5: evidence of coevolution between a pair of sites",

  prime:
"# PRIME — Property Informed Models of Evolution\n\n" +
"## Purpose\nTests whether amino acid property changes at each site are non-neutral.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\n- `branches`: Which branches. Default: All\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"prime\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- p-value < 0.05 for individual properties: significant property-level selection",

  difFubar:
"# Differential FUBAR\n\n" +
"## Purpose\nTests for differential selection between two groups of branches at each site.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick with ≥2 branch group labels\n\n" +
"## Parameters\nNo additional parameters.\n\n" +
"## CRITICAL: Tree must have ≥2 group labels\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"difFubar\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"((A:0.1,B:0.2){Group1}:0.3,(C:0.1,D:0.2){Group2}:0.3);\"\n}\n```\n\n" +
"## Interpretation\n- Posterior probability > 0.9: strong evidence of differential selection",

  hivtrace:
"# HIV-TRACE — HIV TRAnsmission Cluster Engine\n\n" +
"## Purpose\nMolecular epidemiology tool for inferring HIV transmission networks from sequence data.\n\n" +
"## Inputs\n- **Alignment**: Nucleotide FASTA (NOT codon-aligned)\n- **Tree**: Not required\n\n" +
"## Parameters\n- `distance_threshold`: Genetic distance threshold (default: 0.015 for HIV pol)\n- `ambiguity_handling`: How to handle ambiguous nucleotides\n- `fraction`: Minimum fraction of overlap\n- `filter_edges`: Edge filtering options\n- `min_overlap`: Minimum overlap for pairwise comparisons\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"hivtrace\",\n  \"alignment\": \"<FASTA>\",\n  \"params\": { \"distance_threshold\": 0.015 }\n}\n```\n\n" +
"## Interpretation\n- Clusters: groups of sequences within the distance threshold\n- Network edges connect genetically similar sequences",

  flea:
"# FLEA — FLAvors of Evolution Analysis\n\n" +
"## Purpose\nAnalyzes longitudinal/serial sequence data to track evolutionary changes over time.\n\n" +
"## Inputs\n- **Alignment**: FASTA format\n- **Tree**: Newick format\n\n" +
"## Parameters\nNo additional parameters.\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"flea\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Tracks evolutionary dynamics across time points",

  bstill:
"# B-STILL — Bayesian STructural Inference of Lineage Localization\n\n" +
"## Purpose\nBayesian structural analysis combining phylogenetic and structural information.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\nNo additional parameters.\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"bstill\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Structural inference results for lineage-specific patterns",

  nrm:
"# NRM — Nucleotide Rate Model\n\n" +
"## Purpose\nEstimates nucleotide substitution rates.\n\n" +
"## Inputs\n- **Alignment**: Codon-aligned FASTA or NEXUS\n- **Tree**: Newick format\n\n" +
"## Parameters\nNo additional parameters.\n\n" +
"## Example spawn_analysis\n```json\n{\n  \"analysis_type\": \"nrm\",\n  \"alignment\": \"<FASTA>\",\n  \"tree\": \"<NEWICK>\"\n}\n```\n\n" +
"## Interpretation\n- Rate parameter estimates for different substitution classes"
};

// Static comparison table
var COMPARISON_TABLE =
"# HyPhy Method Comparison\n\n" +
"| Method | Question Answered | Branch Labels | Codon Required | Key Output |\n" +
"|--------|------------------|---------------|----------------|------------|\n" +
"| aBSREL | Episodic selection on specific branches? | Optional {FG} | Yes | Per-branch p-values |\n" +
"| BUSTED | Gene-wide episodic diversifying selection? | Optional {FG} | Yes | Gene-level p-value |\n" +
"| FEL | Pervasive selection at individual sites? | Optional | Yes | Per-site p-values |\n" +
"| MEME | Episodic selection at individual sites? | Optional | Yes | Per-site p-values |\n" +
"| FUBAR | Site-level selection (Bayesian)? | None | Yes | Posterior probabilities |\n" +
"| SLAC | Site-level selection (counting)? | Optional | Yes | Per-site p-values |\n" +
"| RELAX | Selection relaxed or intensified? | **{TEST} + {REFERENCE}** | Yes | K parameter + p-value |\n" +
"| Contrast-FEL | Selection differs between groups? | **≥2 groups** | Yes | Per-site p-values |\n" +
"| Diff. FUBAR | Differential selection between groups? | **≥2 groups** | Yes | Posterior probabilities |\n" +
"| GARD | Recombination breakpoints? | None | Yes | Breakpoint positions |\n" +
"| MULTIHIT | Multi-nucleotide substitutions? | Optional | Yes | Model comparisons |\n" +
"| FADE | Directional amino acid evolution? | Optional | Yes | Bayes factors per site |\n" +
"| BGM | Coevolving site pairs? | None | Yes | Posterior probabilities |\n" +
"| PRIME | Property-informed selection? | Optional | Yes | Per-site per-property p-values |\n" +
"| HIV-TRACE | Transmission clustering? | None | **No** | Network + clusters |\n" +
"| FLEA | Longitudinal evolution? | None | No | Temporal dynamics |\n" +
"| B-STILL | Structural lineage patterns? | None | Yes | Structural inference |\n" +
"| NRM | Nucleotide substitution rates? | None | Yes | Rate parameters |";

/**
 * Register all MCP resources on the given McpServer instance.
 */
function registerResources(mcpServer) {

  // ── Static: method comparison table ─────────────────────────────
  mcpServer.resource(
    "methods-comparison",
    "datamonkey://methods/comparison",
    { description: "Plain-text method comparison table: Method, Question, Branch Labels, Codon Required, Output" },
    function () {
      return {
        contents: [{
          uri: "datamonkey://methods/comparison",
          mimeType: "text/markdown",
          text: COMPARISON_TABLE
        }]
      };
    }
  );

  // ── Static: method requirements JSON ────────────────────────────
  mcpServer.resource(
    "methods-requirements",
    "datamonkey://methods/requirements",
    { description: "JSON object with all 18 methods' requirements (tree, codon, branch labels)" },
    function () {
      return {
        contents: [{
          uri: "datamonkey://methods/requirements",
          mimeType: "application/json",
          text: JSON.stringify(METHOD_REQUIREMENTS, null, 2)
        }]
      };
    }
  );

  // ── Template: per-method guide ──────────────────────────────────
  mcpServer.resource(
    "method-guide",
    new ResourceTemplate("datamonkey://methods/{method_name}/guide", { list: undefined }),
    { description: "Detailed per-method guide: purpose, inputs, parameters, interpretation, example" },
    function (uri, params) {
      var methodName = params.method_name;
      var guide = METHOD_GUIDES[methodName];

      if (!guide) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "text/plain",
            text: "Unknown method: " + methodName + ". Available methods: " + METHOD_KEYS.join(", ")
          }]
        };
      }

      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/markdown",
          text: guide
        }]
      };
    }
  );
}

exports.registerResources = registerResources;
exports.METHOD_KEYS = METHOD_KEYS;
exports.METHOD_REQUIREMENTS = METHOD_REQUIREMENTS;
exports.METHOD_GUIDES = METHOD_GUIDES;
exports.COMPARISON_TABLE = COMPARISON_TABLE;
