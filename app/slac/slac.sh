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

HYPHY=$CWD/../../.hyphy/hyphy
HYPHY_PATH=$CWD/../../.hyphy/res/
RESULTS_FILE=$fn.SLAC.json

SLAC=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/SLAC.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

#TODO - Check if there is a supplied tree
#TODO - Allow user to select which branches

# Genetic Code
# Sequence alignment
# Branches to test 
# Number of samples used (use default)
# p-value

BRANCHES=1
NUM_SAMPLES=100
PVAL=0.1

# Using 1 for now, but should accept labeled branches
echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo '$BRANCHES'; echo '$NUM_SAMPLES'; echo '$PVAL'; echo '$RESULTS_FILE';) | '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $SLAC''
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo $BRANCHES; echo $NUM_SAMPLES; echo $PVAL; echo $RESULTS_FILE;) | $HYPHY -i LIBPATH=$HYPHY_PATH $SLAC > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
