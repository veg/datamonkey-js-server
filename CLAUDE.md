# CLAUDE.md

## Cluster Environment

- This server runs on a SLURM cluster (silverback) with shared home directories and node-local `/tmp`.
- **CRITICAL: `/tmp` is NOT shared across cluster nodes.** When testing MPI/SLURM jobs, all input and output files must be on a shared filesystem (e.g., `/home/sweaver/`). MPI rank 0 runs on the head node but other ranks run on compute nodes — they cannot access files on the head node's `/tmp`.
- Compute nodes do NOT have `lmod` installed. Module load commands will silently fail.
- HyPhy binaries are at `.hyphy/HYPHYMPI` and `.hyphy/HYPHYMP` (symlink to `hyphy`).
- OpenMPI 5.0.7 libs: `/opt/ohpc/pub/mpi/openmpi5-gnu14/5.0.7/lib/`
- UCX 1.18.0 libs: `/opt/ohpc/pub/mpi/ucx-ohpc/1.18.0/lib/`
- **Cluster env is centralized in `app/cluster-env.sh`** (tracked silverback defaults: lmod guard, `gnu14/14.2.0 openmpi5/5.0.7`, the OpenMPI 5.0.7 + UCX 1.18.0 lib dirs, and a `/usr/lib64` suffix). Every HyPhy wrapper and `hivtrace_submit.sh` sources it through one canonical `# >>> cluster-env` block, which `test/cluster-env.test.js` pins verbatim. **Never re-inline `module load`, `/opt/ohpc` or `LD_LIBRARY_PATH` into a wrapper**; that kind of drift broke FUBAR (#504).
- **Other clusters:** `cp app/cluster-env.local.example app/cluster-env.local.sh` (gitignored) and set only the `DM_ENV_*` variables that differ. Inherited `DM_ENV_*` values are ignored (with a WARNING) on purpose, because `--export=ALL` forwards the server's env into jobs; the inherited `LD_LIBRARY_PATH` is kept, so it can mask a wrong `DM_ENV_MPI_LIB_DIRS` (treat any `WARNING: cluster-env: ... not found` in a job .out as a wrong override; validate with `env -u LD_LIBRARY_PATH`). The file is per checkout (gitignored): copy it into every deployment (prod, staging) and every worktree; a checkout without it uses the silverback defaults. A site file that returns non-zero fails every job loudly.
- **Locating it:** wrappers anchor on the `cwd=` param (`$cwd/..`). Under sbatch/qsub, `$0`/`BASH_SOURCE` point at the scheduler's spool copy (`/var/spool/slurmd/job<ID>/slurm_script`), so never locate repo files from them. Every submitter (factory descriptors, gard, hivtrace) passes `cwd=`; `SLURM_SUBMIT_DIR`/`PBS_O_WORKDIR` (= `app/<x>/output`) are last-resort fallbacks only, because they follow symlinked output dirs and (Torque) the server's inherited `$PWD`.
- **The LD_LIBRARY_PATH pin is load-bearing**; module loads are best effort. Every srun line reads `srun --mpi=$MPI_TYPE -n N /usr/bin/env LD_LIBRARY_PATH="$MPI_LIB_PATH:$LD_LIBRARY_PATH" $HYPHY ...`.
- Shell files are read at exec time, so changing cluster-env needs no server/MCP restart. It must be deployed together with the wrappers: a wrapper that cannot find it fails every job loudly.
- **First deploy of cluster-env to a checkout carrying hand hot-patches** (prod v3 had one in `app/fubar/fubar.sh`): as the checkout owner, (1) `git status --porcelain app/` and `git diff app/fubar/fubar.sh app/bstill/bstill.sh`, confirming the patch is only what #504 merged; (2) `git checkout -- <dirty wrappers>` (do NOT `git stash`/`stash pop`: the pop re-inlines the env block this refactor removed); (3) `git pull`; (4) confirm `app/cluster-env.sh` exists and `app/cluster-env.local.sh` does NOT (silverback needs none); (5) submit one FUBAR and one GARD job: each .out has `cluster-env: loaded` and `cluster-env: found libmpi.so.40`, and the .err has no `cannot open shared object`. No pm2 restart is needed for the shell files. (The hivtrace `cwd=` param is JS, so hivtrace picks it up on the next restart; until then it still finds the file via `SLURM_SUBMIT_DIR`.)
- System HyPhy install: `/usr/local/bin/HYPHYMPI`, `/usr/local/bin/hyphy`, res at `/usr/local/share/hyphy/`

## Testing

- Before filing upstream bugs, verify on the latest released version first.
- When testing SLURM/MPI jobs, always use files on shared storage, never `/tmp`.
- Use `clush -g all` or `clush -w node0` to run commands on compute nodes.
- Use `srun --partition=datamonkey --mpi=pmix` for MPI job testing.

## MCP Server

- Located in `lib/mcp/` — uses `@modelcontextprotocol/sdk` with StreamableHTTP transport.
- Runs on a separate Express instance on `config.mcp_port` (default 7016).
- Stdio transport at `lib/mcp/stdio.js` for local Claude Code usage.
- Tools: `list_analyses`, `spawn_analysis`, `job_status`, `get_results`, `cancel_job`, `validate_alignment`, `axomeme_scan`.
- `spawnAnalysis` in `lib/mcp/spawn-helpers.js` bridges MCP tool calls to the existing analysis constructors.
- **Restart a long-lived MCP server after deploying.** Node caches `require`d modules for the process lifetime, so descriptor and model changes are silently ignored by a running stdio/HTTP server while shell-script changes (read at exec time) still apply. The partial update looks like a bug in the change itself — a job spawned through a stale server will use old export keys against a new script.

### AxoMEME

- AxoMEME is NOT a HyPhy method — it is an ONNX neural surrogate for MEME (`lib/axomeme/`), run as a Node CLI behind the standard job lifecycle (no `.bf`, no MPI).
- The `axomeme_scan` MCP tool runs synchronous scans without going through the job queue.
- Requires a tree WITH branch lengths; genetic code is fixed (universal) and there is no branch selection.
- Model is `axomeme_v1_viral_finetuned.onnx` (v1-viral). It has 4 inputs and ONE output (`lrt`); the retired 2.0 export had 5 and 5. Results therefore carry no `alphaDs`/`betaPosDn`/`pPos` — those fields are omitted, never zero-filled.
- The model is shared with datamonkey3 and must be swapped in lockstep — see **Updating the AxoMEME model** below before touching it.

### Updating the AxoMEME model

- **Swap both repos together, in one release.** The artifact ships here in `lib/axomeme/model/` and in datamonkey3 under `static/models/axomeme/`. Landing one side alone means the same alignment returns different numbers depending on the execution-mode toggle — nothing errors and the user cannot tell.
- **`datamonkey/axomeme` on HuggingFace is gated** (401 unauthenticated). Take the `.onnx` from the datamonkey3 PR branch instead. That also guarantees both sides ship *identical bytes* rather than two independently-downloaded copies.
- **Read the graph; do not trust the handoff doc.** The v1-viral doc's input table said four tensors while its prose said five. Load the artifact with `onnxruntime-node` and print `inputNames` / `outputNames` before writing any code against it.
- **Assume the contract changed, not just the weights.** 2.0 → v1-viral went from 5 inputs / 5 outputs to 4 / 1. These move together: the artifact; `vendor/modelContract.js` (`INPUT_SPEC`, `OUTPUT_SPEC`, `VERIFIED_MODEL_SHA256`, and any cross-tensor validation tied to a removed input); `vendor/assemble.js` (which tensors `batch()` emits); `vendor/postprocess.js` (row fields); `session.js` (`MODEL_PATH` filename, `runSites` feeds and return); `predict.js` (`MODEL_VERSION`, the output accumulator).
- **`test/axomeme/model-integrity.test.js` is the tripwire.** It pins sha256 + byte size *and* cross-checks `VERIFIED_MODEL_SHA256`, so swapping the artifact and the contract without it fails loudly instead of leaving the two agreeing with each other and with nothing that was ever verified.
- **A removed output means a removed field, never a zero.** A zero in a dS column reads as "no synonymous change" — a measurement the model never made. hyphy-scope ≥ 1.11.0 renders those columns conditionally, so results stored from an older model keep displaying.
- **Prove cross-surface parity; do not infer it from matching code.** datamonkey3 is `type: module`, so its `src/lib/services/axomeme/*.js` run directly under Node. Feed the same alignment and tree through its `prepareAlignment` + `buildPredictions` and the same graph via `onnxruntime-node`, then diff per-site `lrt` against this repo's `predictAxomeme`. The target is `max |Δlrt| = 0` with no call disagreements — anything else is a real divergence.
- **`vendor/` is kept diffable against datamonkey3.** Mirror their edits and their comments rather than rewriting; the conversion recipe is in `lib/axomeme/README.md`. Porting their tests may need matchers added to `test/axomeme/shim.js` (`toBeUndefined` and `toHaveProperty` arrived that way).
- **`max_species` must match datamonkey3** (≤ 512, Max-PD selection). The reference pipeline has no subsampling and the server has memory the browser lacks, but matching wins: otherwise the same alignment scores differently per execution mode above 512 taxa. Reasoning is recorded in `lib/axomeme/predict.js`.

### Tree parameter routing

Different analyses read the tree from different locations in the params object:
- **FEL/aBSREL/BUSTED/RELAX**: `params.analysis.tagged_nwk_tree` or `params.tree`
- **MEME/PRIME/SLAC/axomeme**: `params.msa[0].nj`, then prefer `params.analysis.msa[0].usertree`

`spawnAnalysis` sets the tree in all locations (`params.tree`, `msa[0].nj`, `msa[0].usertree`, `analysis.msa[0]`) to ensure every analysis constructor finds it.

### WebSocket vs MCP code paths

The WebSocket path (`server.js` routes) receives params from the frontend/MongoDB with `msa[0].nj` and `msa[0].usertree` already populated. The MCP path (`spawn-helpers.js`) must build these params manually — when adding new analyses or changing tree handling, both paths need to be kept in sync.
