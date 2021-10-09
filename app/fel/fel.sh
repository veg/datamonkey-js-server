#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0
module load openmpi/gnu/3.0.2

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
BOOTSTRAP=$bootstrap
RESAMPLE=$resample
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code
RATE_VARIATION=$rate_variation
PROCS=$procs

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/
FEL=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FEL.bf
RESULTS_FILE=$fn.FEL.json

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo $BOOTSTRAP
echo $RESAMPLE

if [ $BOOTSTRAP = "true" ]
then
  echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $FEL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --srv $RATE_VARIATION --output $RESULTS_FILE --resample $RESAMPLE >> $PROGRESS_FILE"
  mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $FEL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --srv $RATE_VARIATION --output $RESULTS_FILE --resample $RESAMPLE >> $PROGRESS_FILE
else
  echo "$HYPHY LIBPATH=$HYPHY_PATH $BUSTED --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "All" --rates $omegaClasses --syn-rates $synRateClasses --srv $synRateVariation --grid-size $initialPointsInLikelihood --starting-points $initialGuesses --kill-zero-lengths $KZERO --output $RESULTS_FILE --save-fit /dev/null"
  $HYPHY LIBPATH=$HYPHY_PATH $BUSTED --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "All" --rates $omegaClasses --syn-rates $synRateClasses --srv $synRateVariation --grid-size $initialPointsInLikelihood --starting-points $initialGuesses --kill-zero-lengths $KZERO --output $RESULTS_FILE --save-fit /dev/null > $PROGRESS_FILE
fi

echo "Completed" > $STATUS_FILE

