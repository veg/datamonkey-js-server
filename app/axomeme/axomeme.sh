#!/bin/bash

# AxoMEME job script. Unlike the sibling HyPhy scripts there is no HYPHYMPI,
# no srun, no lmod: AxoMEME is a neural surrogate for MEME and the runner
# (lib/axomeme/cli.js) is a single-process node program, so SLURM and local
# execution are the same command line.

export PATH=/usr/local/bin:$PATH

# Under SLURM these keys arrive as ENVIRONMENT VARIABLES via the sbatch
# --export=ALL,... list and "$@" is empty, so this loop is a no-op and the
# exported values win. On local submits the same key=val pairs arrive as
# arguments and the loop populates them.
for arg in "$@"; do
  case $arg in
    fn=*)
      fn="${arg#*=}"
      ;;
    tree_fn=*)
      tree_fn="${arg#*=}"
      ;;
    sfn=*)
      sfn="${arg#*=}"
      ;;
    pfn=*)
      pfn="${arg#*=}"
      ;;
    rfn=*)
      rfn="${arg#*=}"
      ;;
    treemode=*)
      treemode="${arg#*=}"
      ;;
    call_mode=*)
      call_mode="${arg#*=}"
      ;;
    max_species=*)
      max_species="${arg#*=}"
      ;;
    reference_sequence=*)
      reference_sequence="${arg#*=}"
      ;;
    genetic_code=*)
      genetic_code="${arg#*=}"
      ;;
    analysis_type=*)
      analysis_type="${arg#*=}"
      ;;
    cwd=*)
      cwd="${arg#*=}"
      ;;
    msaid=*)
      msaid="${arg#*=}"
      ;;
    procs=*)
      procs="${arg#*=}"
      ;;
  esac
done

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$fn.AXOMEME.json
CALL_MODE="${call_mode:-percentile}"
MAX_SPECIES="${max_species:-512}"
REFERENCE_SEQUENCE="$reference_sequence"
# Log parity only — the model has no genetic-code option (universal baked in).
GENETIC_CODE="${genetic_code:-Universal}"
PROCS=${procs:-1}

trap 'echo "Error" > "$STATUS_FILE"; exit 1' ERR

echo "PROCS: $PROCS"
echo "SLURM_JOB_ID: $SLURM_JOB_ID"
echo "PROGRESS_FILE: '$PROGRESS_FILE'"
echo "STATUS_FILE: '$STATUS_FILE'"
echo "FN: '$FN'"
echo "TREE_FN: '$TREE_FN'"
echo "RESULTS_FN: '$RESULTS_FN'"
echo "CALL_MODE: '$CALL_MODE'"
echo "MAX_SPECIES: '$MAX_SPECIES'"
echo "REFERENCE_SEQUENCE: '$REFERENCE_SEQUENCE'"
echo "GENETIC_CODE: '$GENETIC_CODE'"

NODE_BIN=$(command -v node || echo /usr/local/bin/node)
echo "NODE_BIN: '$NODE_BIN'"

echo "$NODE_BIN $CWD/../../lib/axomeme/cli.js --alignment $FN --tree $TREE_FN --output $RESULTS_FN --call-mode $CALL_MODE --max-species $MAX_SPECIES --reference-sequence $REFERENCE_SEQUENCE --threads $PROCS > \"$PROGRESS_FILE\""
"$NODE_BIN" "$CWD/../../lib/axomeme/cli.js" --alignment "$FN" --tree "$TREE_FN" --output "$RESULTS_FN" --call-mode "$CALL_MODE" --max-species "$MAX_SPECIES" --reference-sequence "$REFERENCE_SEQUENCE" --threads "$PROCS" > "$PROGRESS_FILE"

echo "Completed" > "$STATUS_FILE"
