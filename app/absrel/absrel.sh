##!/bin/bash
#PBS -l nodes=1:ppn=16

export PATH=/usr/local/bin:$PATH

module load openmpi/gnu/1.6.3
module load gcc/6.1.0

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy/HYPHYMP
export HYPHY_PATH=$CWD/../../.hyphy/res/
ABSREL=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/aBSREL.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo 5; echo 4;) | '$HYPHY' '$ABSREL''
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo 5; echo 4;) | $HYPHY $ABSREL > $PROGRESS_FILE
