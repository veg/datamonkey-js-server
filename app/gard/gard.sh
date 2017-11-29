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
RATE_VARIATION=$rate_var
RATE_CLASSES=$rate_classes

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/

# Needs an MPI environment
GARD=$HYPHY_PATH/TemplateBatchFiles/GARD.bf
MODEL=010010

#RATE_VARIATIONS
# 1: None
# 2: General Discrete
# 3: Beta-Gamma


export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo '(echo '$FN'; echo '$MODEL'; echo '$RATE_VARIATION'; echo '$RATE_CLASSES'; echo '$RESULTS_FN') | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $GARD''
(echo $FN; echo $MODEL; echo $RATE_VARIATION; echo $RATE_CLASSES; echo $RESULTS_FN;) | mpirun -np 48 $HYPHY LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
