#!/bin/bash
#PBS -l nodes=10:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | HYPHYMP $CWD/BUSTED.bf"
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | HYPHYMP $CWD/BUSTED.bf
echo "Completed" > $STATUS_FILE

