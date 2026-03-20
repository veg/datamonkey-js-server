/**
 * MCP Prompt templates for guided analysis experience.
 */

var z = require("zod");

var ANALYSIS_TYPES = [
  "absrel", "fel", "busted", "relax", "meme", "slac", "fubar",
  "gard", "cfel", "multihit", "nrm", "fade", "bgm", "bstill",
  "difFubar", "prime", "hivtrace", "flea"
];

/**
 * Register all MCP prompts on the given McpServer instance.
 */
function registerPrompts(mcpServer) {

  // ── choose-method ────────────────────────────────────────────────
  mcpServer.prompt(
    "choose-method",
    "Decision matrix: maps biological questions to appropriate HyPhy analysis methods",
    { question: z.string().optional().describe("Your biological question (optional)") },
    function (args) {
      var intro = args.question
        ? "Based on your question: \"" + args.question + "\"\n\n"
        : "";

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: intro +
"# HyPhy Method Selection Guide\n\n" +
"## Selection by Biological Question\n\n" +
"| Question | Method | Branch Labels? | Codon Alignment? |\n" +
"|----------|--------|---------------|------------------|\n" +
"| Is there evidence of positive selection on specific branches? | **aBSREL** | Optional {FG} | Yes |\n" +
"| Is there gene-wide episodic diversifying selection? | **BUSTED** | Optional {FG} | Yes |\n" +
"| Which sites are under pervasive selection? | **FEL** | Optional | Yes |\n" +
"| Which sites are under episodic selection? | **MEME** | Optional | Yes |\n" +
"| Quick site-level selection scan (Bayesian)? | **FUBAR** | No | Yes |\n" +
"| Simple counting-based selection detection? | **SLAC** | Optional | Yes |\n" +
"| Has selection intensity changed (relaxed/intensified)? | **RELAX** | **Required**: {TEST} + {REFERENCE} | Yes |\n" +
"| Do different branch groups have different selection? | **Contrast-FEL** | **Required**: ≥2 groups | Yes |\n" +
"| Differential selection between two groups? | **Differential FUBAR** | **Required**: ≥2 groups | Yes |\n" +
"| Is there recombination in my alignment? | **GARD** | No | Yes |\n" +
"| Are there multi-nucleotide substitutions? | **MULTIHIT** | Optional | Yes |\n" +
"| Directional evolution at protein level? | **FADE** | Optional | Yes |\n" +
"| Are sites coevolving? | **BGM** | No | Yes |\n" +
"| Property-informed selection analysis? | **PRIME** | Optional | Yes |\n" +
"| HIV molecular epidemiology / clustering? | **HIV-TRACE** | No | **No** (nucleotide) |\n" +
"| Structural lineage analysis? | **B-STILL** | No | Yes |\n\n" +
"## Key Decision Points\n\n" +
"1. **Do you need branch-specific results?** → aBSREL, BUSTED, RELAX\n" +
"2. **Do you need site-specific results?** → FEL, MEME, FUBAR, SLAC\n" +
"3. **Comparing groups of branches?** → Contrast-FEL, RELAX, Differential FUBAR\n" +
"4. **Not sure about recombination?** → Run GARD first, then use breakpoints\n\n" +
"Use the `list_analyses` tool to see all available parameters for each method."
          }
        }]
      };
    }
  );

  // ── run-busted ───────────────────────────────────────────────────
  mcpServer.prompt(
    "run-busted",
    "BUSTED analysis setup guide with foreground branch guidance",
    {
      has_foreground_branches: z.enum(["yes", "no", "unsure"]).describe(
        "Whether your tree has foreground branch labels"
      )
    },
    function (args) {
      var branchGuidance;
      if (args.has_foreground_branches === "yes") {
        branchGuidance =
          "Your tree has foreground branches labeled. BUSTED will test those specific " +
          "branches for evidence of episodic diversifying selection.\n\n" +
          "Make sure branches are labeled with `{FG}` in the Newick string, e.g.:\n" +
          "`((seq1:0.1,seq2:0.2){FG}:0.3,seq3:0.4);`";
      } else if (args.has_foreground_branches === "no") {
        branchGuidance =
          "Without foreground branches, BUSTED will test ALL branches for selection.\n" +
          "This is valid but may have reduced power compared to a targeted test.\n\n" +
          "To add foreground branches, label them with `{FG}` in your Newick tree:\n" +
          "`((seq1:0.1,seq2:0.2){FG}:0.3,seq3:0.4);`";
      } else {
        branchGuidance =
          "If you have a hypothesis about which lineages experienced selection, label those " +
          "branches with `{FG}` in your tree. Otherwise, BUSTED will test all branches.\n\n" +
          "Example labeled tree: `((seq1:0.1,seq2:0.2){FG}:0.3,seq3:0.4);`";
      }

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text:
"# BUSTED Analysis Setup\n\n" +
"**BUSTED** (Branch-site Unrestricted Statistical Test for Episodic Diversification) " +
"tests whether a gene has experienced episodic positive/diversifying selection.\n\n" +
"## Branch Guidance\n\n" + branchGuidance + "\n\n" +
"## Parameters\n\n" +
"- **branches**: Which branches to test (default: all)\n" +
"- **ds_variation**: Model synonymous rate variation across sites (default: no)\n" +
"- **error_protection**: Use BUSTED-E error-protected version (default: no). " +
"Recommended when alignment quality is uncertain.\n" +
"- **rates**: Number of omega rate classes (default: 3)\n" +
"- **syn_rates**: Number of synonymous rate classes (default: 3)\n\n" +
"## Example spawn_analysis Call\n\n" +
"```json\n" +
"{\n" +
"  \"analysis_type\": \"busted\",\n" +
"  \"alignment\": \"<your FASTA alignment>\",\n" +
"  \"tree\": \"((seq1:0.1,seq2:0.2){FG}:0.3,seq3:0.4);\",\n" +
"  \"params\": {\n" +
"    \"branches\": \"FG\"\n" +
"  }\n" +
"}\n" +
"```\n\n" +
"## Interpreting Results\n\n" +
"- Look for `\"test results\"` → `\"p-value\"` < 0.05 for evidence of selection\n" +
"- Evidence ratios > 10 provide strong support\n" +
"- Check `\"Evidence Ratios\"` per site for site-level support"
          }
        }]
      };
    }
  );

  // ── run-relax ────────────────────────────────────────────────────
  mcpServer.prompt(
    "run-relax",
    "RELAX analysis setup guide — mandatory {TEST}/{REFERENCE} branch labels",
    {
      test_branch_label: z.string().describe("Label for test branches (e.g., TEST)"),
      reference_branch_label: z.string().describe("Label for reference branches (e.g., REFERENCE)")
    },
    function (args) {
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text:
"# RELAX Analysis Setup\n\n" +
"**RELAX** tests whether the strength of natural selection has been relaxed " +
"or intensified along a specified set of test branches relative to reference branches.\n\n" +
"## CRITICAL: Branch Label Requirements\n\n" +
"RELAX **requires** two sets of labeled branches in your Newick tree:\n" +
"- `{" + args.test_branch_label + "}` — test branches (hypothesis: selection changed here)\n" +
"- `{" + args.reference_branch_label + "}` — reference branches (baseline selection)\n\n" +
"### Example Tree Format\n\n" +
"```\n" +
"((seq1:0.1,seq2:0.2){" + args.test_branch_label + "}:0.3," +
"(seq3:0.1,seq4:0.2){" + args.reference_branch_label + "}:0.3);\n" +
"```\n\n" +
"**Without these labels, RELAX will fail.** The analysis cannot proceed without " +
"knowing which branches to compare.\n\n" +
"## Example spawn_analysis Call\n\n" +
"```json\n" +
"{\n" +
"  \"analysis_type\": \"relax\",\n" +
"  \"alignment\": \"<your FASTA alignment>\",\n" +
"  \"tree\": \"((seq1:0.1,seq2:0.2){" + args.test_branch_label + "}:0.3," +
"(seq3:0.1,seq4:0.2){" + args.reference_branch_label + "}:0.3);\",\n" +
"  \"params\": {}\n" +
"}\n" +
"```\n\n" +
"## Interpreting Results\n\n" +
"- **K parameter**: K > 1 = selection intensified, K < 1 = selection relaxed\n" +
"- **p-value** < 0.05: significant evidence for relaxation/intensification\n" +
"- Check `\"test results\"` → `\"relaxation or intensification parameter\"` (K)\n" +
"- Check `\"test results\"` → `\"p-value\"` for significance"
          }
        }]
      };
    }
  );

  // ── interpret-results ────────────────────────────────────────────
  mcpServer.prompt(
    "interpret-results",
    "Method-specific guidance for interpreting HyPhy analysis results",
    {
      method: z.enum(ANALYSIS_TYPES).describe("The analysis method to interpret results for")
    },
    function (args) {
      var guidance = getInterpretationGuidance(args.method);
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text:
"# Interpreting " + guidance.name + " Results\n\n" +
guidance.text
          }
        }]
      };
    }
  );
}

function getInterpretationGuidance(method) {
  var guides = {
    absrel: {
      name: "aBSREL",
      text:
"## Key Fields\n" +
"- `\"branch attributes\"` → per-branch results with omega distributions\n" +
"- `\"tested\"` → number of branches tested\n" +
"- Each branch: `\"Corrected P-value\"` — Holm-Bonferroni corrected p-value\n\n" +
"## Significance\n" +
"- Corrected p-value < 0.05: evidence of episodic diversifying selection on that branch\n" +
"- Multiple rate classes indicate complex selection histories\n\n" +
"## Common Misinterpretations\n" +
"- A non-significant result does NOT mean purifying selection — it means no evidence of positive selection\n" +
"- Testing all branches reduces power; consider using foreground labels"
    },
    busted: {
      name: "BUSTED",
      text:
"## Key Fields\n" +
"- `\"test results\"` → `\"p-value\"`: main significance test\n" +
"- `\"Evidence Ratios\"`: per-site evidence for selection\n" +
"- `\"fits\"` → model fit comparisons (Unconstrained vs Constrained)\n\n" +
"## Significance\n" +
"- p-value < 0.05: gene-wide evidence of episodic diversifying selection\n" +
"- This is a gene-level test — it tells you selection occurred SOMEWHERE, not where\n\n" +
"## Common Misinterpretations\n" +
"- BUSTED detects gene-wide signal, not site-specific selection (use FEL/MEME for sites)\n" +
"- A significant result means at least one site on at least one branch experienced selection"
    },
    fel: {
      name: "FEL",
      text:
"## Key Fields\n" +
"- `\"MLE\"` → `\"content\"`: per-site results matrix\n" +
"- Columns: alpha (synonymous), beta (non-synonymous), p-value\n\n" +
"## Significance\n" +
"- p-value < 0.1 (default threshold): evidence of pervasive selection at that site\n" +
"- beta > alpha with significant p-value → positive selection\n" +
"- beta < alpha with significant p-value → purifying selection\n\n" +
"## Common Misinterpretations\n" +
"- FEL detects PERVASIVE (constant) selection, not episodic — use MEME for episodic\n" +
"- Low power with few sequences (<20)"
    },
    relax: {
      name: "RELAX",
      text:
"## Key Fields\n" +
"- `\"test results\"` → `\"relaxation or intensification parameter\"` (K)\n" +
"- `\"test results\"` → `\"p-value\"`: significance of K ≠ 1\n\n" +
"## Significance\n" +
"- p-value < 0.05: significant evidence that selection strength differs\n" +
"- K > 1: selection is INTENSIFIED on test branches\n" +
"- K < 1: selection is RELAXED on test branches\n" +
"- K = 1: no change in selection intensity\n\n" +
"## Common Misinterpretations\n" +
"- RELAX tests for CHANGE in selection strength, not presence/absence of selection\n" +
"- A relaxation result doesn't mean no selection — it means weaker selection"
    },
    meme: {
      name: "MEME",
      text:
"## Key Fields\n" +
"- `\"MLE\"` → `\"content\"`: per-site results\n" +
"- Columns include alpha, beta+, p-value, branches with support\n\n" +
"## Significance\n" +
"- p-value < 0.1: evidence of episodic positive selection at that site\n" +
"- MEME can detect selection even when only a fraction of branches are affected\n\n" +
"## Common Misinterpretations\n" +
"- MEME is more powerful than FEL for detecting episodic selection\n" +
"- Sites significant in MEME but not FEL suggest episodic (not pervasive) selection"
    },
    slac: {
      name: "SLAC",
      text:
"## Key Fields\n" +
"- `\"MLE\"` → `\"content\"`: per-site dN-dS estimates\n\n" +
"## Significance\n" +
"- p-value < 0.1 for significant sites\n" +
"- SLAC is a counting method — fast but conservative\n\n" +
"## Common Misinterpretations\n" +
"- SLAC is the most conservative method — non-significant does not rule out selection\n" +
"- Best suited for large datasets (>50 sequences)"
    },
    fubar: {
      name: "FUBAR",
      text:
"## Key Fields\n" +
"- `\"MLE\"` → `\"content\"`: per-site posterior probabilities\n" +
"- Columns: alpha, beta, posterior probability of positive selection, posterior probability of purifying selection\n\n" +
"## Significance\n" +
"- Posterior probability > 0.9: strong evidence of selection at that site\n" +
"- Uses Bayesian approach (no p-values)\n\n" +
"## Common Misinterpretations\n" +
"- FUBAR assumes constant selection across branches (like FEL)\n" +
"- Faster than FEL but may be less accurate for small datasets"
    },
    gard: {
      name: "GARD",
      text:
"## Key Fields\n" +
"- `\"breakpoints\"`: detected recombination breakpoint positions\n" +
"- `\"improvements\"`: AIC improvement at each breakpoint\n\n" +
"## Significance\n" +
"- KH test p-value < 0.05 for each breakpoint: significant topological incongruence\n" +
"- Use detected breakpoints to partition alignment for downstream analyses\n\n" +
"## Common Misinterpretations\n" +
"- Not all breakpoints indicate recombination — they indicate topological incongruence\n" +
"- Run GARD before other selection analyses if recombination is suspected"
    },
    cfel: {
      name: "Contrast-FEL",
      text:
"## Key Fields\n" +
"- Per-site test for differential selection between branch groups\n" +
"- p-value for each site testing H0: same selection across groups\n\n" +
"## Significance\n" +
"- p-value < 0.05: significant difference in selection between groups at that site\n\n" +
"## Common Misinterpretations\n" +
"- Tests for DIFFERENCES in selection, not presence of selection itself\n" +
"- Requires ≥2 branch groups labeled in the tree"
    },
    multihit: {
      name: "MULTIHIT",
      text:
"## Key Fields\n" +
"- Model comparison between single, double, and triple nucleotide substitution models\n" +
"- AIC/BIC for model selection\n\n" +
"## Significance\n" +
"- Compare AIC between models — lower AIC indicates better fit\n" +
"- Significant multi-nucleotide substitutions suggest standard models may be inadequate"
    },
    fade: {
      name: "FADE",
      text:
"## Key Fields\n" +
"- Per-site Bayes factors for directional evolution toward each amino acid\n" +
"- `\"MLE\"` → `\"content\"`: results matrix\n\n" +
"## Significance\n" +
"- Bayes factor > 100: strong evidence for directional evolution\n" +
"- Identifies which amino acid the site is evolving toward"
    },
    bgm: {
      name: "BGM",
      text:
"## Key Fields\n" +
"- `\"MLE\"` → `\"content\"`: pairwise site coevolution results\n" +
"- Posterior probability for each pair of coevolving sites\n\n" +
"## Significance\n" +
"- Posterior probability > 0.5: evidence of coevolution between site pair\n" +
"- Higher values indicate stronger evidence"
    },
    prime: {
      name: "PRIME",
      text:
"## Key Fields\n" +
"- Per-site tests for property-informed selection\n" +
"- Tests whether amino acid property changes are non-neutral\n\n" +
"## Significance\n" +
"- p-value < 0.05: significant property-level selection at that site\n" +
"- Distinguishes between different biochemical properties driving evolution"
    },
    difFubar: {
      name: "Differential FUBAR",
      text:
"## Key Fields\n" +
"- Per-site posterior probabilities for differential selection between groups\n\n" +
"## Significance\n" +
"- Posterior probability > 0.9: strong evidence of differential selection\n" +
"- Compares selection regimes between two branch groups"
    },
    hivtrace: {
      name: "HIV-TRACE",
      text:
"## Key Fields\n" +
"- `\"trace_results\"`: clustering results\n" +
"- `\"Nodes\"` and `\"Edges\"`: transmission network structure\n\n" +
"## Significance\n" +
"- Genetic distance threshold determines cluster membership\n" +
"- Default 1.5% for HIV pol sequences\n\n" +
"## Common Misinterpretations\n" +
"- Clusters indicate genetic similarity, not direct transmission\n" +
"- Results are sensitive to the distance threshold chosen"
    },
    flea: {
      name: "FLEA",
      text:
"## Key Fields\n" +
"- Evolutionary analysis of longitudinal sequence data\n\n" +
"## Significance\n" +
"- Tracks evolutionary changes over time in serial samples"
    },
    bstill: {
      name: "B-STILL",
      text:
"## Key Fields\n" +
"- Structural inference of lineage-specific patterns\n\n" +
"## Significance\n" +
"- Bayesian analysis combining structural and evolutionary information"
    },
    nrm: {
      name: "NRM",
      text:
"## Key Fields\n" +
"- Nucleotide substitution rate estimates\n\n" +
"## Significance\n" +
"- Compare rate parameters across different nucleotide substitution classes"
    }
  };

  return guides[method] || { name: method, text: "No specific interpretation guide available for this method." };
}

exports.registerPrompts = registerPrompts;
