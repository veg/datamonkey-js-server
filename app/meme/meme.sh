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
MULTIPLE_HITS="$multiple_hits"
SITE_MULTIHIT="$site_multihit"
RATES="$rates"
RESAMPLE="$resample"
IMPUTE_STATES="$impute_states"
RESULTS_FN=$fn.MEME.json
GENETIC_CODE=$genetic_code
PROCS=$procs

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH meme --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --multiple-hits $MULTIPLE_HITS --site-multihit $SITE_MULTIHIT --rates $RATES --resample $RESAMPLE --impute-states $IMPUTE_STATES >> $PROGRESS_FILE"
mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" meme --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --multiple-hits $MULTIPLE_HITS --site-multihit $SITE_MULTIHIT --rates $RATES --resample $RESAMPLE --impute-states $IMPUTE_STATES >> $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
