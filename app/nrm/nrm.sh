#!/bin/bash

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
source /etc/profile.d/modules.sh


FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code
RATE_CLASSES=$rate_classes
PROCS=$procs

HYPHY=$CWD/../../.hyphy/hyphy
HYPHY_PATH=$CWD/../../.hyphy/res/
HYPHY_ANALYSES_PATH=$CWD/../../.hyphy-analyses
NRM=$HYPHY_ANALYSES_PATH/NucleotideNonREV/NRM.bf

export HYPHY_PATH=$HYPHY_PATH
trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "$HYPHY LIBPATH=$HYPHY_PATH   $NRM --alignment $FN --output $RESULTS_FN"
$HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;"  $NRM --alignment $FN --output $RESULTS_FN > $PROGRESS_FILE
echo "Completed" > $STATUS_FILE


