#!/bin/bash
#PBS -l nodes=1:ppn=32

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

HYPHY=$CWD/../../.hyphy2.3/HYPHYMP
HYPHY_PATH=$CWD/../../.hyphy2.3/res/
MEME=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/MEME.bf
export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

#TODO - Check if there is a supplied tree
#TODO - Allow user to select which branches

echo '(echo '$GENETIC_CODE'; echo '$FN'; echo 1; echo '0.1') | '$HYPHY' '$MEME''
(echo $GENETIC_CODE; echo $FN; echo 1; echo "0.1") | $HYPHY LIBPATH=$HYPHY_PATH $MEME
