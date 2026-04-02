# CLAUDE.md

## Cluster Environment

- This server runs on a SLURM cluster (silverback) with shared home directories and node-local `/tmp`.
- **CRITICAL: `/tmp` is NOT shared across cluster nodes.** When testing MPI/SLURM jobs, all input and output files must be on a shared filesystem (e.g., `/home/sweaver/`). MPI rank 0 runs on the head node but other ranks run on compute nodes — they cannot access files on the head node's `/tmp`.
- Compute nodes do NOT have `lmod` installed. Module load commands will silently fail.
- HyPhy binaries are at `.hyphy/HYPHYMPI` and `.hyphy/HYPHYMP` (symlink to `hyphy`).
- OpenMPI 5.0.7 libs: `/opt/ohpc/pub/mpi/openmpi5-gnu14/5.0.7/lib/`
- UCX 1.18.0 libs: `/opt/ohpc/pub/mpi/ucx-ohpc/1.18.0/lib/`
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
- Tools: `list_analyses`, `spawn_analysis`, `job_status`, `get_results`, `cancel_job`, `validate_alignment`.
- `spawnAnalysis` in `lib/mcp/spawn-helpers.js` bridges MCP tool calls to the existing analysis constructors.

### Tree parameter routing

Different analyses read the tree from different locations in the params object:
- **FEL/aBSREL/BUSTED/RELAX**: `params.analysis.tagged_nwk_tree` or `params.tree`
- **MEME/PRIME/SLAC**: `params.msa[0].nj`, then prefer `params.analysis.msa[0].usertree`

`spawnAnalysis` sets the tree in all locations (`params.tree`, `msa[0].nj`, `msa[0].usertree`, `analysis.msa[0]`) to ensure every analysis constructor finds it.

### WebSocket vs MCP code paths

The WebSocket path (`server.js` routes) receives params from the frontend/MongoDB with `msa[0].nj` and `msa[0].usertree` already populated. The MCP path (`spawn-helpers.js`) must build these params manually — when adding new analyses or changing tree handling, both paths need to be kept in sync.
