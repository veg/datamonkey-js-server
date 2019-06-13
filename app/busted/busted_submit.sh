#!/bin/bash

export PATH=/usr/local/bin:$PATH
module load aocc/1.2.1

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
RESULTS_FILE=$fn.BUSTED.json
FG_BranchesAllSelected="4"
FG_BranchesSomeSelected="5"
synRateVariation=$synRateVariation
synRateClasses=3
omegaClasses=3
initialPointsInLikelihood=250
initialGuesses=1


GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf
HYPHY=$CWD/../../.hyphy/hyphy

export HYPHY_PATH=$CWD/../../.hyphy/res/
BUSTED=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/BUSTED.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

output=$(echo $TREE_FN | $HYPHY $GETCOUNT )
count=$(echo "${output: -1}")

if [ $count -eq 2 ]
then
  echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo $FG_BranchesSomeSelected; echo $synRateVariation; echo $omegaClasses; echo $synRateClasses; echo $initialPointsInLikelihood; echo $initialGuesses; echo $RESULTS_FILE; echo '/dev/null';) | $HYPHY -i LIBPATH=$HYPHY_PATH $BUSTED"
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo $FG_BranchesSomeSelected; echo $synRateVariation; echo $omegaClasses; echo $synRateClasses; echo $initialPointsInLikelihood; echo $initialGuesses; echo $RESULTS_FILE; echo '/dev/null';) | $HYPHY -i LIBPATH=$HYPHY_PATH $BUSTED > $PROGRESS_FILE
else
echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo $FG_BranchesAllSelected; echo $synRateVariation; echo $omegaClasses; echo $synRateClasses; echo $initialPointsInLikelihood; echo $initialGuesses; echo $RESULTS_FILE; echo '/dev/null';) | $HYPHY -i LIBPATH=$HYPHY_PATH $BUSTED"
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo $FG_BranchesAllSelected; echo $synRateVariation; echo $omegaClasses; echo $synRateClasses; echo $initialPointsInLikelihood; echo $initialGuesses; echo $RESULTS_FILE; echo '/dev/null';) | $HYPHY -i LIBPATH=$HYPHY_PATH $BUSTED > $PROGRESS_FILE
fi
echo "Completed" > $STATUS_FILE
