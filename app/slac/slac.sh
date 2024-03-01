#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0
module load openmpi/gnu/3.1.6

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
NUM_SAMPLES=100
PVAL=0.1
KZERO="No"

# Using 1 for now, but should accept labeled branches
echo $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $SLAC --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "All" --samples $NUM_SAMPLES --pvalue $PVAL --kill-zero-lengths $KZERO --output $RESULTS_FILE
$HYPHY LIBPATH=$HYPHY_PATH $SLAC ENV="TOLERATE_NUMERICAL_ERRORS=1;" --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --branches "All" --samples $NUM_SAMPLES --pvalue $PVAL --kill-zero-lengths $KZERO --output $RESULTS_FILE > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
