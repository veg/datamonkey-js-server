#!/bin/bash

# Set the PATH but skip module loading - system specific
export PATH=/usr/local/bin:$PATH

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
RESULTS_FN=$fn.ABSREL.json
GENETIC_CODE=$genetic_code
PROCS=$procs

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/
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

if [ -n "$SLURM_JOB_ID" ]; then
  # Using SLURM srun with dedicated arguments
  # Try the non-MPI version as a fallback since we're having library issues with MPI
  echo "Running HYPHY in non-MPI mode as a fallback due to library issues..."
  
  HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
  
  if [ -f "$HYPHY_NON_MPI" ]; then
    echo "Using non-MPI HYPHY: $HYPHY_NON_MPI"
    echo "$HYPHY_NON_MPI LIBPATH=$HYPHY_PATH -z ENV=\"TOLERATE_NUMERICAL_ERRORS=1;\" $HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches All --output $RESULTS_FN >> $PROGRESS_FILE"
    export TOLERATE_NUMERICAL_ERRORS=1
    $HYPHY_NON_MPI LIBPATH=$HYPHY_PATH $HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches All --output $RESULTS_FN >> $PROGRESS_FILE
  else
    echo "Non-MPI HYPHY not found at $HYPHY_NON_MPI, attempting to use MPI version"
    echo "srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH -z ENV=\"TOLERATE_NUMERICAL_ERRORS=1;\" $HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches All --output $RESULTS_FN >> $PROGRESS_FILE"
    export TOLERATE_NUMERICAL_ERRORS=1
    srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH $HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches All --output $RESULTS_FN >> $PROGRESS_FILE
  fi
else
  # Using mpirun for non-SLURM environments
  echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH -z ENV=\"TOLERATE_NUMERICAL_ERRORS=1;\" $HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches All --output $RESULTS_FN >> $PROGRESS_FILE"
  export TOLERATE_NUMERICAL_ERRORS=1
  mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches All --output $RESULTS_FN >> $PROGRESS_FILE
fi

echo "Completed" > $STATUS_FILE
