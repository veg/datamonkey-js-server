#!/bin/bash
#PBS -l nodes=10:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
HYPHY=$CWD/../../node_modules/hyphy/HYPHYMP
RELAX=$CWD/RELAX.bf
export HYPHY_PATH=$CWD/../../node_modules/hyphy/res/

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo '(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "2";echo "2";) | $HYPHY $RELAX'
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "2";echo "2";) | $HYPHY $RELAX
echo "Completed" > $STATUS_FILE
