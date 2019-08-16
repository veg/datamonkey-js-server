#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code
RATE_VARIATION=$rate_variation

HYPHY=$CWD/../../.hyphy/hyphy
HYPHY_PATH=$CWD/../../.hyphy/res/
FEL=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FEL.bf
RESULTS_FILE=$fn.FEL.json
GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

output=$(echo $TREE_FN | $HYPHY $GETCOUNT )
count=$(echo "${output: -1}")

if [ $count -eq 2 ]
then
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 5; echo '$RATE_VARIATION'; echo '0.1'; echo $RESULTS_FILE;) | '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $FEL''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "5"; echo $RATE_VARIATION; echo "0.1"; echo $RESULTS_FILE;) | $HYPHY -i LIBPATH=$HYPHY_PATH $FEL > $PROGRESS_FILE
else
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 4; echo '$RATE_VARIATION'; echo '0.1'; echo $RESULTS_FILE;) | '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $FEL''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4"; echo $RATE_VARIATION; echo "0.1"; echo $RESULTS_FILE;) | $HYPHY -i LIBPATH=$HYPHY_PATH $FEL > $PROGRESS_FILE
fi
echo "Completed" > $STATUS_FILE
