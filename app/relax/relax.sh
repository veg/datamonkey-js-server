#!/bin/bash

export PATH=/usr/local/bin:$PATH
module load aocc/1.3.0

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
ANALYSIS_TYPE=$analysis_type
OMEGA_RATE_CLASSES=3

HYPHY=$CWD/../../.hyphy/HYPHYMP
RESULT_FILE=$fn.RELAX.json
GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf

export HYPHY_PATH=$CWD/../../.hyphy/res/
RELAX=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/RELAX.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
count=$(echo '(echo '$TREE_FN') | '$HYPHY' '$GETCOUNT'' 2> /dev/null)

if [ $count -eq 2]
then
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 2; echo '$OMEGA_RATE_CLASSES'; echo '$ANALYSIS_TYPE'; echo '$RESULTS_FILE';) | '$HYPHY' -i LIBPATH='$HYPHY_PATH' '$RELAX''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 2; echo $OMEGA_RATE_CLASSES; echo $ANALYSIS_TYPE; echo $RESULTS_FILE;) | $HYPHY -i LIBPATH=$HYPHY_PATH $RELAX > $PROGRESS_FILE
else
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 3; echo 2; echo '$OMEGA_RATE_CLASSES'; echo '$ANALYSIS_TYPE'; echo '$RESULTS_FILE';) | '$HYPHY' -i LIBPATH='$HYPHY_PATH' '$RELAX''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 3; echo 2; echo $OMEGA_RATE_CLASSES; echo $ANALYSIS_TYPE; echo $RESULTS_FILE;) | $HYPHY -i LIBPATH=$HYPHY_PATH $RELAX > $PROGRESS_FILE
fi
