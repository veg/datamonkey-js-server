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
PROCS=$procs

HYPHY=$CWD/../../.hyphy/hyphy
HYPHY_PATH=$CWD/../../.hyphy/res/
HYPHY_ANALYSES_PATH=$CWD/../../.hyphy-analyses
NRM=$HYPHY_ANALYSES_PATH/NucleotideNonREV/NRM.bf

export HYPHY_PATH=$HYPHY_PATH
trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "$HYPHY LIBPATH=$HYPHY_PATH   $NRM --alignment $FN --output $RESULTS_FN"
$HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;"  $NRM --alignment $FN --output $RESULTS_FN > $PROGRESS_FILE
echo "Completed" > $STATUS_FILE


