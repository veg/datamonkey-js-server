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
BOOTSTRAP=$bootstrap
CI=$ci
RESAMPLE=$resample
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

if [ $BOOTSTRAP = "true" ]
then
  echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FEL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --srv $RATE_VARIATION --output $RESULTS_FILE --resample $RESAMPLE --ci $CI >> $PROGRESS_FILE"
  mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FEL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --srv $RATE_VARIATION --output $RESULTS_FILE --resample $RESAMPLE --ci $CI >> $PROGRESS_FILE
else
  echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FEL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --srv $RATE_VARIATION --output $RESULTS_FILE --ci $CI >> $PROGRESS_FILE"
  mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FEL --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --branches FG --srv $RATE_VARIATION --output $RESULTS_FILE --ci $CI >> $PROGRESS_FILE
fi

echo "Completed" > $STATUS_FILE

