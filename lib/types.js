/**
 * lib/types.js — shared JSDoc type definitions (Phase 3, #410).
 *
 * The recurring bugs in this codebase were params-SHAPE bugs (msaid read from
 * msa._id instead of msa[0]._id (#403); Contrast-FEL branch-sets (#395); the
 * per-analysis tree-location routing). This file documents the canonical shapes
 * as JSDoc @typedefs so `// @ts-check`-annotated modules get type-checking on
 * the params they read — the exact place those bugs live.
 *
 * This module exports nothing at runtime; it exists purely for the types.
 * Reference a type from another module with:
 *   /** @typedef {import("./types").AnalysisParams} AnalysisParams *\/
 * or, for a whole file, add `// @ts-check` at the top and annotate with
 * `@param {import("./types").AnalysisParams} params`.
 *
 * The tree-routing quirk (see CLAUDE.md): different analyses read the tree from
 * different locations —
 *   - FEL/aBSREL/BUSTED/RELAX: params.analysis.tagged_nwk_tree || params.tree
 *   - MEME/PRIME/SLAC:         params.msa[0].nj, then params.analysis.msa[0].usertree
 * which is why several of these fields are optional.
 */

/**
 * One multiple-sequence-alignment entry. Analyses read the tree and codon
 * settings from here (msa[0]).
 *
 * @typedef {Object} MsaEntry
 * @property {string} [_id]        MongoDB id of the alignment.
 * @property {string} [nj]         Neighbor-joining tree (Newick).
 * @property {string} [usertree]   User-supplied tree (preferred by MEME/PRIME/SLAC).
 * @property {number} [gencodeid]  Genetic-code index (genetic_code = code[gencodeid+1]).
 * @property {number} [datatype]   Datatype index (nucleotide/amino-acid/codon).
 * @property {number} [sites]      Number of sites.
 * @property {number} [sequences]  Number of sequences.
 */

/**
 * The nested "analysis" sub-object (present in the unified data format). Some
 * analyses read the tree / rate-variation flags from here.
 *
 * @typedef {Object} AnalysisSpec
 * @property {string} [_id]                MongoDB id of the analysis (-> job id).
 * @property {string} [tagged_nwk_tree]    Tree with {FG}/tag annotations.
 * @property {MsaEntry[]} [msa]            Alignment(s) under analysis.
 * @property {number} [ds_variation]       Synonymous-rate-variation flag (1 -> "Yes").
 * @property {boolean} [ci]                Confidence-interval flag.
 * @property {string} [submission_source]  Where the job came from (e.g. "mcp").
 */

/**
 * The params object every analysis constructor receives as its 3rd argument
 * (`new X(socket, stream, params)`). It is a union of the legacy flat shape and
 * the unified {analysis, msa} shape, so most fields are optional; each analysis
 * reads the subset it needs with `|| default` fallbacks.
 *
 * @typedef {Object} AnalysisParams
 * @property {string} [_id]                 Job/analysis id (legacy flat form).
 * @property {AnalysisSpec} [analysis]      Unified-format analysis sub-object.
 * @property {MsaEntry[]} [msa]             Alignment(s) — msa[0] holds the tree/codon info.
 * @property {string} [tree]                Tree merged in by the route layer.
 * @property {string} [nwk_tree]            Alternate tree field.
 * @property {string} [genetic_code]        e.g. "Universal".
 * @property {string} [treemode]            "0" | "user".
 * @property {boolean} [checkOnly]          Validate-only (no SLURM submission).
 * @property {string} [msaid]               Alignment id (legacy).
 * @property {string} [submission_source]   Job source tag.
 * @property {(string[]|string)} [branch-set] Contrast-FEL branch groups (#395).
 */

/**
 * The `{job, tree}` envelope the socket route layer receives from the frontend
 * (server.js / lib/routes/analysis-routes.js). The route merges `tree` into a
 * copy of `job` before constructing the analysis.
 *
 * @typedef {Object} SpawnRequest
 * @property {AnalysisParams} job  The analysis params.
 * @property {string} [tree]       Tree to merge into job.
 * @property {string} [id]         Job id (used by resubscribe/cancel routes).
 */

module.exports = {};
