DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh


#filename
#tree mode
#genetic code
#posterior p

BASEPATH=$ABS_DIR/Analyses/PRIME/

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

# The first step doesn't use MPI, so use HYPHYMP for it
(echo $1; echo $2) | HYPHYMP USEPATH=$ABS_DIR/Analyses/PRIME/ ${BASEPATH}PRIME_DOWNLOAD.bf >  ${BASEPATH}hpout 2>&1

# For the fitglobal step, use HYPHYMP without bpsh which might not exist in the SLURM environment
(echo $1; echo $3;) | HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf > ${BASEPATH}hpout 2>&1

# For the final step that uses MPI, provide a fallback mechanism
HYPHY_MPI=HYPHYMPI
HYPHY_NON_MPI=HYPHYMP

# We don't need the MPI_COMMAND variable anymore as we're using direct commands
if [ -n "$SLURM_JOB_ID" ]; then
  echo "Running under SLURM with job ID: $SLURM_JOB_ID"
  MPI_TYPE="${slurm_mpi_type:-pmix}"
  echo "Using MPI type: $MPI_TYPE"
  
  # Try the non-MPI version as a fallback since we're having library issues with MPI
  if [ -x "$(command -v $HYPHY_NON_MPI)" ]; then
    echo "Using non-MPI HYPHY as fallback: $HYPHY_NON_MPI"
    (echo $1; echo $3; echo 0; echo $4; echo 1; echo $2;) | $HYPHY_NON_MPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1
  else
    echo "Non-MPI HYPHY not found at $HYPHY_NON_MPI, attempting to use MPI version"
    (echo $1; echo $3; echo 0; echo $4; echo 1; echo $2;) | srun --mpi=$MPI_TYPE -n 4 $HYPHY_MPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1
  fi
else
  # Using mpirun for non-SLURM environments, with a smaller process count (was 193)
  echo "Using mpirun with HYPHYMPI"
  (echo $1; echo $3; echo 0; echo $4; echo 1; echo $2;) | mpirun -np 4 $HYPHY_MPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1
fi

