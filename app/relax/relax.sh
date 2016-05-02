#!/bin/bash
#PBS -l nodes=1:ppn=32

export PATH=/usr/local/bin:$PATH

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
ANALYSIS_TYPE=$analysis_type
HYPHY=$CWD/../../.hyphy226/HYPHYMP
RELAX=$CWD/RELAX.bf
GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf 
export HYPHY_PATH=$CWD/../../.hyphy226/res/

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
count=$(echo '(echo '$TREE_FN') | '$HYPHY' '$GETCOUNT'' 2> /dev/null)
if [ $count -eq 2]
then
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 2;echo '$ANALYSIS_TYPE') | '$HYPHY' '$RELAX''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 2;echo $ANALYSIS_TYPE) | $HYPHY $RELAX
else
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 3; echo 2;echo '$ANALYSIS_TYPE') | '$HYPHY' '$RELAX''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 3; echo 2;echo $ANALYSIS_TYPE) | $HYPHY $RELAX
fi
