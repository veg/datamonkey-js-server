#!/bin/bash

# Set the PATH but skip module loading - system specific
export PATH=/usr/local/bin:$PATH

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

# Try to load modules if they exist, but don't fail if they don't
if [ -f /etc/profile.d/modules.sh ]; then
  source /etc/profile.d/modules.sh
  
  # Load the specific OpenMPI module for ARM architecture
  module load openmpi-arm/5.0.5 2>/dev/null || echo "Failed to load openmpi-arm/5.0.5"
  
  # Check if module was loaded successfully
  module list 2>&1
  
  # Print library paths for debugging
  echo "LD_LIBRARY_PATH: $LD_LIBRARY_PATH"
else
  echo "Module system not available, using system environment"
fi

# Make sure UCX libraries are available - these paths are critical for the MPI support
export LD_LIBRARY_PATH=/opt/ohpc/pub/mpi/ucx-ohpc/1.17.0/lib:$LD_LIBRARY_PATH:/usr/lib64

# Print library paths and attempt to verify UCX is available
echo "LD_LIBRARY_PATH after adjustment: $LD_LIBRARY_PATH"
ls -l /opt/ohpc/pub/mpi/ucx-ohpc/1.17.0/lib/libucp.so* 2>&1 || echo "UCX libraries not found"

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
MODEL="${model:-JTT}"
PROCS=${procs:-48}

# Set HYPHY executable - prefer regular hyphy for local execution
HYPHY_REGULAR=$CWD/../../.hyphy/hyphy
HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
HYPHY_MPI=$CWD/../../.hyphy/HYPHYMPI

# Check which HYPHY version to use
if [ -z "$SLURM_JOB_ID" ] && [ -f "$HYPHY_REGULAR" ]; then
  # Local execution and regular hyphy exists - use it
  HYPHY=$HYPHY_REGULAR
  echo "Using regular HYPHY for local execution: $HYPHY"
elif [ -z "$SLURM_JOB_ID" ] && [ -f "$HYPHY_NON_MPI" ]; then
  # Local execution and non-MPI version exists - use it
  HYPHY=$HYPHY_NON_MPI
  echo "Using non-MPI HYPHY for local execution: $HYPHY"
elif [ -f "$HYPHY_MPI" ]; then
  # Use MPI version (for cluster execution or if others not available)
  HYPHY=$HYPHY_MPI
  echo "Using MPI HYPHY: $HYPHY"
else
  # Fallback - try to find any HYPHY executable
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
  # Using SLURM srun with dedicated arguments
  # Try the non-MPI version as a fallback since we're having library issues with MPI
  echo "Running HYPHY in non-MPI mode as a fallback due to library issues..."
  
  HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
  
  if [ -f "$HYPHY_NON_MPI" ]; then
    echo "Using non-MPI HYPHY: $HYPHY_NON_MPI"
    export TOLERATE_NUMERICAL_ERRORS=1
    echo "$HYPHY_NON_MPI LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> \"$PROGRESS_FILE\""
    $HYPHY_NON_MPI LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> "$PROGRESS_FILE"
  else
    echo "Non-MPI HYPHY not found at $HYPHY_NON_MPI, attempting to use MPI version"
    export TOLERATE_NUMERICAL_ERRORS=1
    echo "srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> \"$PROGRESS_FILE\""
    srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> "$PROGRESS_FILE"
  fi
else
  # For local execution, use the HYPHY executable determined above
  echo "Using local HYPHY execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  
  # Check if we can use MPI for local execution (if using MPI version)
  if [[ "$HYPHY" == *"HYPHYMPI"* ]] && command -v mpirun &> /dev/null; then
    echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> \"$PROGRESS_FILE\""
    mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> "$PROGRESS_FILE"
  else
    echo "$HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> \"$PROGRESS_FILE\""
    $HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --tree $TREE_FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --max-breakpoints $MAX_BREAKPOINTS --output $RESULTS_FN >> "$PROGRESS_FILE"
  fi
fi

echo "Completed" > $STATUS_FILE


