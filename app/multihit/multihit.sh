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
RATE_CLASSES=$rate_classes
TRIPLE_ISLANDS=$triple_islands
PROCS=$procs

sets=(`echo $branch_sets | sed 's/:/\n/g'`)

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/
HYPHY_ANALYSES_PATH=$CWD/../../.hyphy-analyses
MULTIHIT=$HYPHY_ANALYSES_PATH/FitMultiModel/FitMultiModel.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;"  $MULTIHIT --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --rates $RATE_CLASSES --triple-islands $TRIPLE_ISLANDS --output $RESULTS_FN"
mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;"  $MULTIHIT --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --rates $RATE_CLASSES --triple-islands $TRIPLE_ISLANDS --output $RESULTS_FN > $PROGRESS_FILE
echo "Completed" > $STATUS_FILE

