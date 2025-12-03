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

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
ANALYSIS_TYPE=$analysis_type
OMEGA_RATE_CLASSES=3
KZERO="No"

HYPHY=$CWD/../../.hyphy/HYPHYMP
RESULT_FILE=$fn.RELAX.json

export HYPHY_PATH=$CWD/../../.hyphy/res/
RELAX=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/RELAX.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "$HYPHY LIBPATH=$HYPHY_PATH   $RELAX --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --mode "Classic mode" --test TEST --reference REFERENCE --models "All" --rates $OMEGA_RATE_CLASSES  --kill-zero-lengths $KZERO --output $RESULT_FILE"
$HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;"  $RELAX --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --mode "Classic mode" --test TEST --reference REFERENCE --models "All" --rates $OMEGA_RATE_CLASSES --kill-zero-lengths $KZERO --output $RESULT_FILE > $PROGRESS_FILE
