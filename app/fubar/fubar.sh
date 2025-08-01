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
    number_of_grid_points=*)
      number_of_grid_points="${arg#*=}"
      ;;
    concentration_of_dirichlet_prior=*)
      concentration_of_dirichlet_prior="${arg#*=}"
      ;;
  esac
done

# Try to load modules if they exist, but don't fail if they don't
if [ -f /etc/profile.d/modules.sh ]; then
  source /etc/profile.d/modules.sh
  
  # Load modules only if available
  module load aocc/1.3.0 2>/dev/null || echo "Failed to load aocc/1.3.0"
  module load openmpi/gnu/3.1.6 2>/dev/null || echo "Failed to load openmpi/gnu/3.1.6"
else
  echo "Module system not available, using system environment"
fi

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$fn.FUBAR.json
GENETIC_CODE=$genetic_code
GRIDPOINTS="${number_of_grid_points:-20}"
CONCENTRATION="${concentration_of_dirichlet_prior:-0.5}"
PROCS=${procs:-1}

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

FUBAR=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FUBAR.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > "$STATUS_FILE"; exit 1' ERR

# Log environment info
echo "PROCS: $PROCS"
echo "SLURM_JOB_ID: $SLURM_JOB_ID"
echo "PROGRESS_FILE: '$PROGRESS_FILE'"
echo "STATUS_FILE: '$STATUS_FILE'"
echo "FN: '$FN'"
echo "TREE_FN: '$TREE_FN'"
echo "RESULTS_FN: '$RESULTS_FN'"
echo "GRIDPOINTS: '$GRIDPOINTS'"
echo "CONCENTRATION: '$CONCENTRATION'"

if [ -n "$SLURM_JOB_ID" ]; then
  echo "Running under SLURM with job ID: $SLURM_JOB_ID"
  MPI_TYPE="${slurm_mpi_type:-pmix}"
  echo "Using MPI type: $MPI_TYPE"
else
  echo "Running without SLURM, using local execution"
fi

if [ -n "$SLURM_JOB_ID" ]; then
  # Using SLURM srun
  echo "Using SLURM execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  echo "srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH fubar --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --output $RESULTS_FN >> \"$PROGRESS_FILE\""
  srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH fubar --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --output $RESULTS_FN >> "$PROGRESS_FILE"
else
  # For local execution, use the HYPHY executable determined above
  echo "Using local HYPHY execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  echo "$HYPHY LIBPATH=$HYPHY_PATH fubar --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --output $RESULTS_FN >> \"$PROGRESS_FILE\""
  $HYPHY LIBPATH=$HYPHY_PATH fubar --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --output $RESULTS_FN >> "$PROGRESS_FILE"
fi

echo "Completed" > "$STATUS_FILE"
