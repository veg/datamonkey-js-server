#!/bin/bash

# Parse command line arguments and set environment variables
# For local execution, parameters are passed as command line arguments like "fn=/path/to/file"
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
    genetic_code=*)
      genetic_code="${arg#*=}"
      ;;
    multiple_hits=*)
      multiple_hits="${arg#*=}"
      ;;
    srv=*)
      srv="${arg#*=}"
      ;;
    blb=*)
      blb="${arg#*=}"
      ;;
    branches=*)
      branches="${arg#*=}"
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

# >>> cluster-env (canonical block, pinned verbatim by test/cluster-env.test.js; never edit per wrapper)
# PATH, modules and the OpenMPI/UCX LD_LIBRARY_PATH pin live in app/cluster-env.sh;
# per-site overrides in app/cluster-env.local.sh (gitignored). sbatch/qsub run a
# spooled copy of this script, so $0/BASH_SOURCE are NOT the repo there: anchor on cwd=.
if [ -n "$cwd" ]; then DM_APP_DIR="$cwd/.."
elif [ -n "$SLURM_SUBMIT_DIR" ]; then DM_APP_DIR="$SLURM_SUBMIT_DIR/../.."
elif [ -n "$PBS_O_WORKDIR" ]; then DM_APP_DIR="$PBS_O_WORKDIR/../.."
else DM_APP_DIR="${BASH_SOURCE[0]%/*}/.."
fi
if [ ! -f "$DM_APP_DIR/cluster-env.sh" ]; then
  echo "Error: cluster-env: $DM_APP_DIR/cluster-env.sh not found (cwd='$cwd' SLURM_SUBMIT_DIR='$SLURM_SUBMIT_DIR' PBS_O_WORKDIR='$PBS_O_WORKDIR')" >&2
  DM_STATUS_FN="${sfn:-${fn:+${fn}_status}}"
  if [ -n "$DM_STATUS_FN" ]; then echo "Error" > "$DM_STATUS_FN"; fi
  exit 1
fi
. "$DM_APP_DIR/cluster-env.sh" mpi
# <<< cluster-env

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$fn.ABSREL.json
GENETIC_CODE=$genetic_code
MULTIPLE_HITS="${multiple_hits:-None}"
SRV="${srv:-Yes}"
BLB="${blb:-1.0}"
BRANCHES="${branches:-All}"
PROCS=${procs:-1}

# Set HYPHY executable - prefer regular hyphy for local execution
HYPHY_REGULAR=$CWD/../../.hyphy/hyphy
HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
HYPHY_MPI=$CWD/../../.hyphy/HYPHYMPI

# Check which HYPHY version to use
# Always use non-MPI version for datamonkey jobs
if [ -f "$HYPHY_NON_MPI" ]; then
  HYPHY=$HYPHY_NON_MPI
  echo "Using non-MPI HYPHY: $HYPHY"
elif [ -f "$HYPHY_REGULAR" ]; then
  HYPHY=$HYPHY_REGULAR
  echo "Using regular HYPHY: $HYPHY"
else
  HYPHY=$(which hyphy 2>/dev/null || echo "$CWD/../../.hyphy/hyphy")
  echo "Using fallback HYPHY: $HYPHY"
fi

HYPHY_PATH=$CWD/../../.hyphy/res/
ABSREL=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > "$STATUS_FILE"; exit 1' ERR

# We don't need the MPI_COMMAND variable anymore as we're using direct commands
if [ -n "$SLURM_JOB_ID" ]; then
  echo "Running under SLURM with job ID: $SLURM_JOB_ID"
  MPI_TYPE="${slurm_mpi_type:-pmix}"
  echo "Using MPI type: $MPI_TYPE"
else
  echo "Running without SLURM, using local execution"
fi

# Log environment info
echo "PROCS: $PROCS"
echo "SLURM_JOB_ID: $SLURM_JOB_ID"
echo "slurm_mpi_type: $slurm_mpi_type"
echo "PROGRESS_FILE: '$PROGRESS_FILE'"
echo "STATUS_FILE: '$STATUS_FILE'"
echo "FN: '$FN'"
echo "TREE_FN: '$TREE_FN'"
echo "RESULTS_FN: '$RESULTS_FN'"
echo "MULTIPLE_HITS: '$MULTIPLE_HITS'"
echo "SRV: '$SRV'"
echo "BLB: '$BLB'"
echo "BRANCHES: '$BRANCHES'"

if [ -n "$SLURM_JOB_ID" ]; then
  # Using SLURM srun with dedicated arguments
  # Try the non-MPI version as a fallback since we're having library issues with MPI
  echo "Running HYPHY in non-MPI mode as a fallback due to library issues..."
  
  HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
  
  if [ -f "$HYPHY_NON_MPI" ]; then
    echo "Using non-MPI HYPHY: $HYPHY_NON_MPI"
    export TOLERATE_NUMERICAL_ERRORS=1
    echo "$HYPHY_NON_MPI LIBPATH=$HYPHY_PATH $ABSREL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches $BRANCHES --multiple-hits $MULTIPLE_HITS --srv $SRV --blb $BLB --output $RESULTS_FN > \"$PROGRESS_FILE\""
    $HYPHY_NON_MPI LIBPATH=$HYPHY_PATH $ABSREL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches $BRANCHES --multiple-hits $MULTIPLE_HITS --srv $SRV --blb $BLB --output $RESULTS_FN > "$PROGRESS_FILE"
  else
    echo "Non-MPI HYPHY not found at $HYPHY_NON_MPI, attempting to use MPI version"
    export TOLERATE_NUMERICAL_ERRORS=1
    echo "srun --mpi=$MPI_TYPE -n $PROCS /usr/bin/env LD_LIBRARY_PATH=$MPI_LIB_PATH:\$LD_LIBRARY_PATH $HYPHY LIBPATH=$HYPHY_PATH $ABSREL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches $BRANCHES --multiple-hits $MULTIPLE_HITS --srv $SRV --blb $BLB --output $RESULTS_FN > \"$PROGRESS_FILE\""
    srun --mpi=$MPI_TYPE -n $PROCS /usr/bin/env LD_LIBRARY_PATH="$MPI_LIB_PATH:$LD_LIBRARY_PATH" $HYPHY LIBPATH=$HYPHY_PATH $ABSREL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches $BRANCHES --multiple-hits $MULTIPLE_HITS --srv $SRV --blb $BLB --output $RESULTS_FN > "$PROGRESS_FILE"
  fi
else
  # For local execution, use the HYPHY executable determined above
  echo "Using local HYPHY execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  echo "$HYPHY LIBPATH=$HYPHY_PATH $ABSREL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches $BRANCHES --multiple-hits $MULTIPLE_HITS --srv $SRV --blb $BLB --output $RESULTS_FN > \"$PROGRESS_FILE\""
  $HYPHY LIBPATH=$HYPHY_PATH $ABSREL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches $BRANCHES --multiple-hits $MULTIPLE_HITS --srv $SRV --blb $BLB --output $RESULTS_FN > "$PROGRESS_FILE"
fi

echo "Completed" > "$STATUS_FILE"
