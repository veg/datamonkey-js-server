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

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
RESULTS_FILE=$fn.BUSTED.json
#FG_BranchesAllSelected="4"
#FG_BranchesSomeSelected="5"
synRateVariation=$synRateVariation
ERROR_SINK=$errorProtection
multihit=$multihit
synRateClasses=3
omegaClasses=3
initialPointsInLikelihood=250
initialGuesses=1
KZERO="No"

GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf
HYPHY=$CWD/../../.hyphy/hyphy

export HYPHY_PATH=$CWD/../../.hyphy/res/
BUSTED=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/BUSTED.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

output=$(echo $TREE_FN | $HYPHY $GETCOUNT )
count=$(echo "${output: -1}")

if [ $count -eq 2 ]
then
  echo "$HYPHY LIBPATH=$HYPHY_PATH $BUSTED --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "FG" --rates $omegaClasses --syn-rates $synRateClasses --multiple-hits $multihit --srv $synRateVariation --grid-size $initialPointsInLikelihood --starting-points $initialGuesses --kill-zero-lengths $KZERO --error-sink $ERROR_SINK --output $RESULTS_FILE --save-fit /dev/null"
  $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BUSTED --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "FG" --rates $omegaClasses --syn-rates $synRateClasses --multiple-hits $multihit --srv $synRateVariation --grid-size $initialPointsInLikelihood --starting-points $initialGuesses --kill-zero-lengths $KZERO --error-sink $ERROR_SINK --output $RESULTS_FILE --save-fit /dev/null > $PROGRESS_FILE
else
  echo "$HYPHY LIBPATH=$HYPHY_PATH $BUSTED --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "All" --rates $omegaClasses --syn-rates $synRateClasses --multiple-hits $multihit --srv $synRateVariation --grid-size $initialPointsInLikelihood --starting-points $initialGuesses --kill-zero-lengths $KZERO --error-sink $ERROR_SINK --output $RESULTS_FILE --save-fit /dev/null"
  $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BUSTED --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "All" --rates $omegaClasses --syn-rates $synRateClasses --multiple-hits $multihit --srv $synRateVariation --grid-size $initialPointsInLikelihood --starting-points $initialGuesses --kill-zero-lengths $KZERO --error-sink $ERROR_SINK --output $RESULTS_FILE --save-fit /dev/null > $PROGRESS_FILE
fi

echo "Completed" > $STATUS_FILE
