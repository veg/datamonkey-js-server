#!/bin/bash
#PBS -l nodes=3:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code

export HYPHY_PATH=$CWD/../../.hyphy226/res/
HYPHY=$CWD/../../.hyphy226/HYPHYMP

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | $HYPHY $CWD/BUSTED.bf"
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | $HYPHY $CWD/BUSTED.bf
echo "Completed" > $STATUS_FILE

