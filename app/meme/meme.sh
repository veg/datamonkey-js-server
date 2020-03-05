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
RESULTS_FN=$fn.MEME.json
GENETIC_CODE=$genetic_code
PROCS=$procs

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH meme --alignment $FN --tree $TREE_FN --code $GENETIC_CODE"
mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH meme --alignment $FN --tree $TREE_FN --code $GENETIC_CODE

echo "Completed" > $STATUS_FILE
