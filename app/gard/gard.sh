#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load openmpi/gnu/3.0
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
PROCS=$procs

# As of 10/24/18 we are using version 2.3.11 of HyPhy instead of 2.3.14 for GARD analyses until we work out getting GARD working on 2.3.14 (likely an issue with aocc) 
HYPHY=$CWD/../../.hyphy_gard_version2_3_11/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy_gard_version2_3_11/res/

# Needs an MPI environment
GARD=$HYPHY_PATH/TemplateBatchFiles/GARD.bf
MODEL=010010

#RATE_VARIATIONS
# 1: None
# 2: General Discrete
# 3: Beta-Gamma


export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

if (($RATE_VARIATION < 2))
then
  echo '(echo '$FN'; echo '$MODEL'; echo '$RATE_VARIATION'; echo '$RESULTS_FN') | mpirun -np $PROCS '$HYPHY' LIBPATH='$HYPHY_PATH' ' $GARD''
  (echo $FN; echo $MODEL; echo $RATE_VARIATION; echo $RESULTS_FN;) | mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
else
  echo '(echo '$FN'; echo '$MODEL'; echo '$RATE_VARIATION'; echo '$RATE_CLASSES'; echo '$RESULTS_FN') | mpirun -np $PROCS '$HYPHY' LIBPATH='$HYPHY_PATH' ' $GARD''
  (echo $FN; echo $MODEL; echo $RATE_VARIATION; echo $RATE_CLASSES; echo $RESULTS_FN;) | mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
fi

echo "Completed" > $STATUS_FILE


