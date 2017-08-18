#!/bin/bash
#PBS -l nodes=1:ppn=32

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

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
echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$BRANCHES'; echo '$NUM_SAMPLES'; echo '$PVAL';) | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $SLAC''
(echo $GENETIC_CODE; echo $FN; echo $BRANCHES; echo $NUM_SAMPLES; echo $PVAL;) | $HYPHY LIBPATH=$HYPHY_PATH $SLAC > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
