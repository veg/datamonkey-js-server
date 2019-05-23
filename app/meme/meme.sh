#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.2.1

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy/HYPHYMP
HYPHY_PATH=$CWD/../../.hyphy/res/
MEME=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/MEME.bf
PVAL="0.1"

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 1; echo 1;) | $HYPHY LIBPATH=$HYPHY_PATH $MEME >> $PROGRESS_FILE"
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 1; echo "0.1";) | $HYPHY LIBPATH=$HYPHY_PATH $MEME >> $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
