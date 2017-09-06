#!/bin/bash
#PBS -l nodes=1:ppn=64

export PATH=/usr/local/bin:$PATH
module load gcc/6.1.0
module load openmpi/gnu/1.6.3

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy-2.3.3/HYPHYMP
HYPHY_PATH=$CWD/../../.hyphy-2.3.3/res/
BUSTED=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/BUSTED.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | $HYPHY LIBPATH=$HYPHY_PATH $BUSTED" > $PROGRESS_FILE
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | $HYPHY LIBPATH=$HYPHY_PATH $BUSTED > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
