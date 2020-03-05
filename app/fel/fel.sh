#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0
module load openmpi/gnu/3.0.2

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code
RATE_VARIATION=$rate_variation
PROCS=$procs

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/
FEL=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FEL.bf
RESULTS_FILE=$fn.FEL.json

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $FEL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --srv $RATE_VARIATION --output $RESULTS_FILE >> $PROGRESS_FILE
echo "Completed" > $STATUS_FILE
