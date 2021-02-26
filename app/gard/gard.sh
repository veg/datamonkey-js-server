#/bin/bash

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
RATE_VARIATION=$rate_var
RATE_CLASSES=$rate_classes
DATATYPE=$datatype
RUN_MODE=$run_mode

PROCS=$procs

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/

# Needs an MPI environment
GARD=$HYPHY_PATH/TemplateBatchFiles/GARD.bf
MODEL="JTT"

#RATE_VARIATIONS
# 1: None
# 2: General Discrete
# 3: Beta-Gamma


export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --output $RESULTS_FN"
mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD --type $DATATYPE --alignment $FN --model $MODEL --mode $RUN_MODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --output $RESULTS_FN > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE


