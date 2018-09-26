#!/bin/bash
#PBS -l nodes=1:ppn=32

export PATH=/usr/local/bin:$PATH
module load aocc/1.2.1

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy/HYPHYMP

export HYPHY_PATH=$CWD/../../.hyphy/res/
BUSTED=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/BUSTED.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "5"; echo "4";) | $HYPHY LIBPATH=$HYPHY_PATH $BUSTED"
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "5"; echo "4";) | $HYPHY LIBPATH=$HYPHY_PATH $BUSTED > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
