#!/bin/bash
#PBS -l nodes=1:ppn=16

export PATH=/usr/local/bin:$PATH
module load openmpi/gnu/1.6.3
module load gcc/6.1.0

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
ANALYSIS_TYPE=$analysis_type

HYPHY=$CWD/../../.hyphy-2.3.3/HYPHYMP

export HYPHY_PATH=$CWD/../../.hyphy-2.3.3/res/
RELAX=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/RELAX.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
count=$(echo '(echo '$TREE_FN') | '$HYPHY' '$GETCOUNT'' 2> /dev/null)

if [ $count -eq 2]
then
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 2;echo '$ANALYSIS_TYPE') | '$HYPHY' LIBPATH='$HYPHY_PATH' '$RELAX''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 2;echo $ANALYSIS_TYPE) | $HYPHY LIBPATH=$HYPHY_PATH $RELAX > $PROGRESS_FILE
else
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 3; echo 2;echo '$ANALYSIS_TYPE') | '$HYPHY' LIBPATH='$HYPHY_PATH' '$RELAX''
  (echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 3; echo 2;echo $ANALYSIS_TYPE) | $HYPHY LIBPATH=$HYPHY_PATH $RELAX > $PROGRESS_FILE
fi
