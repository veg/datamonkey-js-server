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
    substitution_model=*)
      substitution_model="${arg#*=}"
      ;;
    posterior_estimation_method=*)
      posterior_estimation_method="${arg#*=}"
      ;;
    branches=*)
      branches="${arg#*=}"
      ;;
    number_of_grid_points=*)
      number_of_grid_points="${arg#*=}"
      ;;
    number_of_mcmc_chains=*)
      number_of_mcmc_chains="${arg#*=}"
      ;;
    length_of_each_chain=*)
      length_of_each_chain="${arg#*=}"
      ;;
    number_of_burn_in_samples=*)
      number_of_burn_in_samples="${arg#*=}"
      ;;
    number_of_samples=*)
      number_of_samples="${arg#*=}"
      ;;
    concentration_of_dirichlet_prior=*)
      concentration_of_dirichlet_prior="${arg#*=}"
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
USE_TREE_IN_FILE='yes'
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
SUBSTITUTIONMODEL="${substitution_model:-HKY85}"
POSTERIORESTIMATIONMETHOD="${posterior_estimation_method:-Metropolis-Hastings}"
BRANCHES="${branches:-All}"
GRIDPOINTS="${number_of_grid_points:-20}"
CHAINS="${number_of_mcmc_chains:-5}"
LENGTH="${length_of_each_chain:-1000000}"
BURNIN="${number_of_burn_in_samples:-100000}"
SAMPLES="${number_of_samples:-100}"
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
RESULTS_FILE=$fn.FADE.json
CACHE_FILE=$fn.FADE.cache
GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf
FG_OPTION_NOT_ALL_SELECTED=5
FG_OPTION_ALL_SELECTED=4

FADE=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FADE.bf

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
echo "RESULTS_FILE: '$RESULTS_FILE'"
echo "CACHE_FILE: '$CACHE_FILE'"
echo "GENETIC_CODE: '$GENETIC_CODE'"
echo "SUBSTITUTIONMODEL: '$SUBSTITUTIONMODEL'"
echo "POSTERIORESTIMATIONMETHOD: '$POSTERIORESTIMATIONMETHOD'"
echo "BRANCHES: '$BRANCHES'"
echo "GRIDPOINTS: '$GRIDPOINTS'"
echo "CHAINS: '$CHAINS'"
echo "LENGTH: '$LENGTH'"
echo "BURNIN: '$BURNIN'"
echo "SAMPLES: '$SAMPLES'"
echo "CONCENTRATION: '$CONCENTRATION'"

count=$(echo '(echo '$TREE_FN') | '$HYPHY' '$GETCOUNT'' 2> /dev/null)


if [ -n "$SLURM_JOB_ID" ]; then
  # Using SLURM srun with dedicated arguments
  # Try the non-MPI version as a fallback since we're having library issues with MPI
  echo "Running HYPHY in non-MPI mode as a fallback due to library issues..."
  
  HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
  
  if [ -f "$HYPHY_NON_MPI" ]; then
    echo "Using non-MPI HYPHY: $HYPHY_NON_MPI"
    export TOLERATE_NUMERICAL_ERRORS=1
    echo "$HYPHY_NON_MPI LIBPATH=$HYPHY_PATH $FADE --alignment $FN --tree $TREE_FN --branches \"$BRANCHES\" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE >> \"$PROGRESS_FILE\""
    $HYPHY_NON_MPI LIBPATH=$HYPHY_PATH $FADE --alignment $FN --tree $TREE_FN --branches "$BRANCHES" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE >> "$PROGRESS_FILE"
  else
    echo "Non-MPI HYPHY not found at $HYPHY_NON_MPI, attempting to use MPI version"
    export TOLERATE_NUMERICAL_ERRORS=1
    echo "srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH $FADE --alignment $FN --tree $TREE_FN --branches \"$BRANCHES\" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE >> \"$PROGRESS_FILE\""
    srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH $FADE --alignment $FN --tree $TREE_FN --branches "$BRANCHES" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE >> "$PROGRESS_FILE"
  fi
else
  # For local execution, use the HYPHY executable determined above
  echo "Using local HYPHY execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  echo "$HYPHY LIBPATH=$HYPHY_PATH $FADE --alignment $FN --tree $TREE_FN --branches \"$BRANCHES\" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE >> \"$PROGRESS_FILE\""
  $HYPHY LIBPATH=$HYPHY_PATH $FADE --alignment $FN --tree $TREE_FN --branches "$BRANCHES" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE >> "$PROGRESS_FILE"
fi

echo "Completed" > "$STATUS_FILE"
