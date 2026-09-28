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
    rate_var=*)
      rate_var="${arg#*=}"
      ;;
    rate_classes=*)
      rate_classes="${arg#*=}"
      ;;
    datatype=*)
      datatype="${arg#*=}"
      ;;
    run_mode=*)
      run_mode="${arg#*=}"
      ;;
    max_breakpoints=*)
      max_breakpoints="${arg#*=}"
      ;;
    model=*)
      model="${arg#*=}"
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
RESULTS_FN=$rfn
GENETIC_CODE="${genetic_code:-Universal}"
RATE_VARIATION="${rate_var:-None}"
RATE_CLASSES="${rate_classes:-2}"
DATATYPE="${datatype:-codon}"
RUN_MODE="${run_mode:-Normal}"
MAX_BREAKPOINTS="${max_breakpoints:-10000}"

# --- GARD codon + rate-variation guard ---
# HyPhy GARD does not support rate variation with codon data: the run never
# converges and HYPHY aborts ("MG_REV.ModelDescription needs 2 parameters,
# but 1 were supplied"). See veg/hyphy#981 (maintainer: codon+RV unsupported;
# classic datamonkey removed the codon option for this reason). Coerce RV off
# for codon so the job completes instead of guaranteed-aborting.
if [ "$DATATYPE" = "codon" ] && [ "$RATE_VARIATION" != "None" ]; then
  echo "WARNING: GARD codon data does not support rate variation ('$RATE_VARIATION'); forcing --rv None (veg/hyphy#981)."
  RATE_VARIATION="None"
fi
# --- end guard ---
MODEL="${model:-JTT}"
PROCS=${procs:-48}

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
GARD=$HYPHY_PATH/TemplateBatchFiles/GARD.bf

#RATE_VARIATIONS
# 1: None
# 2: General Discrete
# 3: Beta-Gamma

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

# We don't need the MPI_COMMAND variable anymore as we're using direct commands
if [ -n "$SLURM_JOB_ID" ]; then
  echo "Running under SLURM with job ID: $SLURM_JOB_ID"
  MPI_TYPE="${slurm_mpi_type:-pmix}"
  echo "Using MPI type: $MPI_TYPE"
else
  echo "Running without SLURM, using mpirun"
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
echo "GENETIC_CODE: '$GENETIC_CODE'"
echo "RATE_VARIATION: '$RATE_VARIATION'"
echo "RATE_CLASSES: '$RATE_CLASSES'"
echo "DATATYPE: '$DATATYPE'"
echo "RUN_MODE: '$RUN_MODE'"
echo "MAX_BREAKPOINTS: '$MAX_BREAKPOINTS'"
echo "MODEL: '$MODEL'"

if [ -n "$SLURM_JOB_ID" ]; then
  # Run GARD under MPI via srun. The env wrapper below pins LD_LIBRARY_PATH into
  # the task environment on the compute node so HYPHYMPI can resolve libmpi.so.40
  # regardless of whether srun propagated the launching shell's environment.
  export TOLERATE_NUMERICAL_ERRORS=1

  if [ -f "$HYPHY_MPI" ]; then
    echo "Using MPI HYPHY under srun: $HYPHY_MPI"
    echo "srun --mpi=$MPI_TYPE -n $PROCS /usr/bin/env LD_LIBRARY_PATH=$MPI_LIB_PATH:\$LD_LIBRARY_PATH $HYPHY_MPI ENV=\"TOLERATE_NUMERICAL_ERRORS=1;\" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > \"$PROGRESS_FILE\""
    srun --mpi=$MPI_TYPE -n $PROCS /usr/bin/env LD_LIBRARY_PATH="$MPI_LIB_PATH:$LD_LIBRARY_PATH" $HYPHY_MPI ENV="TOLERATE_NUMERICAL_ERRORS=1;" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > "$PROGRESS_FILE"
  else
    echo "MPI HYPHY not found at $HYPHY_MPI, falling back to non-MPI HYPHY: $HYPHY_NON_MPI"
    echo "$HYPHY_NON_MPI ENV=\"TOLERATE_NUMERICAL_ERRORS=1;\" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > \"$PROGRESS_FILE\""
    $HYPHY_NON_MPI ENV="TOLERATE_NUMERICAL_ERRORS=1;" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > "$PROGRESS_FILE"
  fi
else
  # For local execution, use the HYPHY executable determined above
  echo "Using local HYPHY execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  
  # Check if we can use MPI for local execution (if using MPI version)
  if [[ "$HYPHY" == *"HYPHYMPI"* ]] && command -v mpirun &> /dev/null; then
    echo "mpirun -np $PROCS $HYPHY ENV=\"TOLERATE_NUMERICAL_ERRORS=1;\" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > \"$PROGRESS_FILE\""
    mpirun -np $PROCS $HYPHY ENV="TOLERATE_NUMERICAL_ERRORS=1;" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > "$PROGRESS_FILE"
  else
    echo "$HYPHY ENV=\"TOLERATE_NUMERICAL_ERRORS=1;\" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > \"$PROGRESS_FILE\""
    $HYPHY ENV="TOLERATE_NUMERICAL_ERRORS=1;" LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN > "$PROGRESS_FILE"
  fi
fi

echo "Completed" > $STATUS_FILE


