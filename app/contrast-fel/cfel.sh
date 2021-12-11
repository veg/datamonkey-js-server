#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0
module load openmpi/gnu/3.0.6

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code
RATE_VARIATION=$rate_variation
PROCS=$procs

sets=(`echo $branch_sets | sed 's/:/\n/g'`)

BRANCH_SETS=$(for x in ${sets[@]}; do echo -n " --branch-set $x "; done;)

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/
RESULTS_FILE=$fn.FEL.json

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH contrast-fel --alignment $FN --tree $TREE_FN $BRANCH_SETS --output $RESULTS_FILE >> $PROGRESS_FILE"
mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH contrast-fel --alignment $FN --tree $TREE_FN $BRANCH_SETS --output $RESULTS_FILE >> $PROGRESS_FILE
echo "Completed" > $STATUS_FILE

