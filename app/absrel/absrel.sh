##!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh
module load aocc/1.3.0
module load openmpi/gnu/3.1.6

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$fn.ABSREL.json
GENETIC_CODE=$genetic_code
PROCS=$procs

HYPHY=$CWD/../../.hyphy/HYPHYMPI

export HYPHY_PATH=$CWD/../../.hyphy/res/

echo 'mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH absrel --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --output $RESULTS_FN >> $PROGRESS_FILE'
mpirun -np $PROCS $HYPHY ENV="TOLERATE_NUMERICAL_ERRORS=1;" LIBPATH=$HYPHY_PATH absrel --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --output $RESULTS_FN >> $PROGRESS_FILE
