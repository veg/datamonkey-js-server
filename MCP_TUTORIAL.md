# Datamonkey MCP Tutorial

Run HyPhy selection analyses from Claude Code using the Datamonkey MCP server.

## Setup

Add the Datamonkey MCP server to your Claude Code configuration:

```bash
claude mcp add dm3 --transport http https://mcp.datamonkey.org/mcp
```

This registers the server as `dm3`. The first time you connect, Claude Code will open a browser window to authorize via OAuth — just click through the prompts. Tools will appear as `mcp__dm3__spawn_analysis`, etc.

## Troubleshooting

### `Unauthorized: Bearer token required` and the browser never opens

The OAuth flow is driven by Claude Code's discovery of the server's Protected Resource Metadata. If you get stuck at this error:

1. Make sure you are on a Claude Code version that supports MCP HTTP OAuth (CLI 2.x and recent IDE extensions). `claude --version` should print `2.x` or later.
2. Run `claude mcp list` — the server should be listed with `! Needs authentication`. If it isn't listed at all, re-run the `claude mcp add` command.
3. Inside a session, run `/mcp dm3` and approve the browser prompt. If the picker dismisses without opening a browser, remove and re-add the server: `claude mcp remove dm3 -s local && claude mcp add dm3 --transport http https://mcp.datamonkey.org/mcp`.

### Manual token fallback

If your client cannot complete the OAuth dance, you can pre-issue a token with curl and pass it via the `Authorization` header. Replace `<verifier>` with any URL-safe random string of 43–128 characters.

```bash
ISSUER=https://mcp.datamonkey.org
VERIFIER=$(openssl rand -base64 60 | tr -d "=+/" | cut -c1-64)
CHALLENGE=$(printf "%s" "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr -d "=" | tr "+/" "-_")

CLIENT=$(curl -s -X POST $ISSUER/register -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["http://localhost/cb"]}')
CLIENT_ID=$(echo "$CLIENT" | jq -r .client_id)

CODE=$(curl -s -o /dev/null -w '%{redirect_url}' \
  "$ISSUER/authorize?client_id=$CLIENT_ID&redirect_uri=http://localhost/cb&code_challenge=$CHALLENGE&code_challenge_method=S256&resource=$ISSUER/mcp" \
  | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')

TOKEN=$(curl -s -X POST $ISSUER/token \
  -d "grant_type=authorization_code&code=$CODE&code_verifier=$VERIFIER&resource=$ISSUER/mcp" \
  | jq -r .access_token)

claude mcp add dm3 --transport http \
  --header "Authorization: Bearer $TOKEN" \
  https://mcp.datamonkey.org/mcp
```

Tokens currently expire after 1 hour and the OAuth state is in-memory — repeat the steps above if the server is restarted.

## Quick Start

Once connected, you can ask Claude to run analyses directly:

> "Run a FEL analysis on my alignment to find sites under selection"

Or use the built-in prompts to get guidance:

> `/mcp__datamonkey__choose-method`

## Available Tools

### `list_analyses`
Lists all 18 available HyPhy methods with their parameters.

### `validate_alignment`
Pre-flight check before submitting a job.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `alignment` | Yes | FASTA alignment data |
| `analysis_type` | No | Method name (enables method-specific validation) |
| `tree` | No | Newick tree string |

### `spawn_analysis`
Submit a new analysis job.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `analysis_type` | Yes | One of: `absrel`, `fel`, `busted`, `relax`, `meme`, `slac`, `fubar`, `gard`, `cfel`, `multihit`, `nrm`, `fade`, `bgm`, `bstill`, `difFubar`, `prime`, `hivtrace`, `flea` |
| `alignment` | Yes | FASTA alignment data |
| `tree` | No | Newick tree (recommended for most analyses) |
| `params` | No | Method-specific parameters (see below) |

### `get_job_status`
Check whether a job is queued, running, completed, or errored.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `job_id` | Yes | Job ID returned by `spawn_analysis` |

### `get_job_results`
Retrieve the full HyPhy JSON output for a completed job.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `job_id` | Yes | Job ID returned by `spawn_analysis` |

### `cancel_job`
Cancel a running or queued job.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `job_id` | Yes | Job ID to cancel |

## Available Prompts

| Prompt | Description |
|--------|-------------|
| `choose-method` | Interactive guide to pick the right HyPhy method for your question |
| `run-busted` | Setup guide for BUSTED with foreground branch labeling |
| `run-relax` | Setup guide for RELAX with required TEST/REFERENCE labels |
| `interpret-results` | Method-specific guidance for interpreting output |

## Available Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Method Comparison | `datamonkey://methods/comparison` | Markdown table comparing all 18 methods |
| Method Requirements | `datamonkey://methods/requirements` | JSON with each method's input requirements |
| Method Guide | `datamonkey://methods/{method}/guide` | Detailed guide for a specific method |

## Example Workflows

### 1. Site-Level Selection (FEL)

Ask Claude:

> "Here's my alignment (attached). Run FEL to find sites under pervasive selection."

Claude will:
1. Validate your alignment
2. Submit the FEL job
3. Poll until completion
4. Summarize which sites show significant positive or negative selection

### 2. Episodic Selection (MEME)

> "Run MEME on my alignment. I want to find sites where positive selection occurred on even a subset of branches."

MEME is the most sensitive method for detecting positive selection because it allows the signal to vary across branches at each site.

### 3. Gene-Wide Selection (BUSTED)

> "Test whether my gene shows any evidence of episodic diversifying selection using BUSTED."

For targeted analysis, label foreground branches in your tree with `{FG}`:

```
((seq1:0.1,seq2:0.2){FG}:0.3,(seq3:0.1,seq4:0.2):0.3);
```

### 4. Selection Relaxation (RELAX)

RELAX **requires** labeled branches. Your tree must have `{TEST}` and `{REFERENCE}` labels:

```
((seq1:0.1,seq2:0.2){TEST}:0.3,(seq3:0.1,seq4:0.2){REFERENCE}:0.3);
```

> "Test whether selection has been relaxed on the TEST branches compared to REFERENCE using RELAX."

### 5. Recombination-Aware Pipeline

If you suspect recombination in your data, run GARD first:

> "Run GARD on my alignment to detect recombination breakpoints, then run FEL on each partition."

### 6. Bayesian Quick Scan (FUBAR)

For a fast Bayesian scan, especially on larger datasets:

> "Run FUBAR on my alignment — I want a quick scan for sites under selection."

FUBAR uses posterior probabilities instead of p-values. Sites with posterior > 0.9 are considered significant.

## Method-Specific Parameters

### FEL
```json
{
  "branches": "All",
  "multiple_hits": "None",
  "ci": false,
  "ds_variation": false
}
```

### MEME
```json
{
  "p_value": 0.1,
  "multiple_hits": "None",
  "rates": 2,
  "resample": 0
}
```

### BUSTED
```json
{
  "branches": "All",
  "ds_variation": 2,
  "error_protection": false,
  "rates": 3,
  "syn_rates": 3
}
```

### RELAX
```json
{
  "mode": "Classic mode",
  "test": "TEST",
  "reference": "REFERENCE",
  "models": "All",
  "rates": 3
}
```

### FUBAR
```json
{
  "number_of_grid_points": 20,
  "concentration_of_dirichlet_prior": 0.5
}
```

### Contrast-FEL
Requires ≥2 branch groups labeled in the tree.
```json
{
  "branch_sets": ["Group1", "Group2"],
  "p_value": 0.05,
  "q_value": 0.20
}
```

### BGM
```json
{
  "length_of_each_chain": 1000000,
  "number_of_burn_in_samples": 100000,
  "number_of_samples": 100,
  "maximum_parents_per_node": 1,
  "minimum_subs_per_site": 1
}
```

## Input Format

### Alignment
FASTA format with **in-frame codon sequences** (length divisible by 3). Sequences must be aligned and all the same length.

```
>Seq1
ATGAAAGCTTGA
>Seq2
ATGAAGGCCTGA
>Seq3
ATGAAAGCCTGA
```

The only exception is **HIV-TRACE**, which accepts unaligned nucleotide sequences.

### Tree
Newick format. Optional for most methods (the server will infer one via neighbor-joining), but providing a tree is recommended.

```
((Seq1:0.1,Seq2:0.2):0.3,Seq3:0.4);
```

For methods requiring branch labels (RELAX, Contrast-FEL), add labels in curly braces:

```
((Seq1:0.1,Seq2:0.2){TEST}:0.3,(Seq3:0.1,Seq4:0.2){REFERENCE}:0.3);
```

## Interpreting Results

### P-value methods (FEL, MEME, SLAC, RELAX, Contrast-FEL)
- p < 0.1 (default threshold): significant evidence of selection
- For FEL/MEME: beta > alpha = positive selection, beta < alpha = negative selection

### Bayesian methods (FUBAR, BGM, Differential FUBAR)
- Posterior probability > 0.9: strong evidence
- No p-values — uses Bayes factors or posterior probabilities

### Gene-level tests (BUSTED)
- p < 0.05: gene-wide evidence of episodic diversifying selection
- Evidence ratios per site provide additional granularity

### Branch-level tests (aBSREL)
- Holm-Bonferroni corrected p-value < 0.05 per branch
- Tests each branch independently for episodic selection

### Relaxation (RELAX)
- K > 1: selection intensified on test branches
- K < 1: selection relaxed on test branches
- p < 0.05: significant change in selection intensity

## Troubleshooting

**"No tree provided" warning**: The server will infer a neighbor-joining tree, but results are better with a user-provided tree.

**"Alignment must contain at least 2 sequences"**: Check your FASTA format. Each sequence needs a `>` header line followed by the sequence on the next line(s).

**"Could not parse any sequences"**: The alignment parser expects FASTA format. NEXUS files are not supported for direct upload — extract the sequences as FASTA first.

**Job status stays "running" for a long time**: Large alignments (hundreds of sequences, thousands of sites) can take minutes to hours. Use `get_job_status` to monitor progress — the `current_status` field shows HyPhy's real-time output.

**"Server not initialized" error**: The MCP session expired. Claude Code will automatically re-establish the session on the next request.
