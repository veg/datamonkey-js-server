Datamonkey Server
========================

##Dependencies
* node
* HIVClustering https://github.com/spond/HIVClustering
* TN93          https://github.com/spond/TN93
* sequtil       https://github.com/nlhepler/sequtil

##INSTALL
    git clone git@github.com:veg/datamonkey-server.git
    git checkout socketio
    cp config.js.tpl config.js 
    node server.js

## Wrapper environment

Every analysis wrapper (`app/<analysis>/*.sh`) follows the same contract:

1. Parse its `key=value` arguments (`for arg in "$@"; do case ...`), so `$cwd`, `$sfn` and `$fn` are set.
2. Run the canonical `# >>> cluster-env` ... `# <<< cluster-env` block, byte-identical in every wrapper and pinned by `test/cluster-env.test.js`. It finds `app/cluster-env.sh` via `$cwd/..` (falling back to `SLURM_SUBMIT_DIR`, `PBS_O_WORKDIR`, then the script's own path only when `cwd` is absent; every submitter, hivtrace included, passes `cwd=`), and fails the job loudly if the file is missing. Never locate repo files from `$0`/`BASH_SOURCE`: sbatch and qsub run a spooled copy of the script.
3. Set `trap ... ERR` and run the analysis.

`app/cluster-env.sh` takes a profile argument:

* `mpi` (HyPhy wrappers): PATH prepend, best-effort module loads, the OpenMPI/UCX `LD_LIBRARY_PATH` pin, and `MPI_LIB_PATH`.
* `base` (`hivtrace_submit.sh`): PATH prepend and module loads only; no library pin.

Site-specific settings go in `app/cluster-env.local.sh` (gitignored; start from `app/cluster-env.local.example`), never in a wrapper. It is sourced into the batch shell, so it can also `export` MPI transport settings (`UCX_TLS`, `OMPI_MCA_*`, `PMIX_MCA_*`) that reach every srun task; scheduler settings (`slurm_mpi_type`, `slurm_partition`, `<method>_procs`, walltimes) belong in `config.json` instead.

Every live srun line uses the same idiom, written out literally:

    srun --mpi=$MPI_TYPE -n N /usr/bin/env LD_LIBRARY_PATH="$MPI_LIB_PATH:$LD_LIBRARY_PATH" $HYPHY ...

Intentionally exempt (they do not source `cluster-env.sh`):

* `axomeme/axomeme.sh`: a Node/ONNX CLI with no lmod/MPI/srun by design; sourcing would add module loads and an LD prefix to onnxruntime-node, which is not equivalent.
* `difFubar/difFubar.sh`: Julia, no MPI/srun; uses `source /etc/profile` + `JULIA_*`. Its local mode is positional with no `cwd`, and CI runs it directly and parses its stdout.
