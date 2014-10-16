#!/bin/bash
#PBS -l nodes=10:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code

trap 'echo "Error" >> $STATUS_FILE; exit' ERR
echo "(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | HYPHYMP /home/sweaver/hyphy/res/TemplateBatchFiles/BUSTED.bf"
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo "4";echo "d";) | HYPHYMP /home/sweaver/hyphy/res/TemplateBatchFiles/BUSTED.bf > $PROGRESS_FILE 2>&1
echo "Completed" >> $STATUS_FILE
