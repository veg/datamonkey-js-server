#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load openmpi/gnu/3.0
module load aocc/1.2.1

FN=$fn
CWD=$cwd
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$fn.GARD.json
SNAPSHOT_FILE=$fn.GARD_finalout
GENETIC_CODE=$genetic_code
SUBSTITUTION_MODEL='1'
RATE_VARIATION=$rate_var
RATE_CLASSES=$rate_classes
DATA_TYPE=$data_type

HYPHY=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/
GARD=$HYPHY_PATH/TemplateBatchFiles/GARD.bf

#RATE_VARIATIONS
# 1: None
# 2: General Discrete
# 3: Beta-Gamma

#DATA_TYPE_variable
# 0: codon
# 1: nucleotide
# 2: protein
#DATA_TYPE_expectedByHyPhy
# 1: Nucleotide
# 2: Protein
# 3: Codon

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

# codon
if [ $DATA_TYPE -eq 0 ]
then
  if (($RATE_VARIATION < 2))
  then
    echo '(echo 3; echo '$GENETIC_CODE'; echo '$FN'; echo '$RATE_VARIATION'; echo '$RESULTS_FN'; echo '$SNAPSHOT_FILE';) | mpirun -np 16 '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $GARD''
    (echo 3; echo $GENETIC_CODE; echo $FN; echo $RATE_VARIATION; echo $RESULTS_FN; echo $SNAPSHOT_FILE;) | mpirun -np 16 $HYPHY -i LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
  else
    echo '(echo 3; echo '$GENETIC_CODE'; echo '$FN'; echo '$RATE_VARIATION'; echo '$RATE_CLASSES'; echo '$RESULTS_FN'; echo '$SNAPSHOT_FILE';) | mpirun -np 16 '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $GARD''
    (echo 3; echo $GENETIC_CODE; echo $FN; echo $RATE_VARIATION; echo $RATE_CLASSES; echo $RESULTS_FN; echo $SNAPSHOT_FILE) | mpirun -np 16 $HYPHY -i LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
  fi
fi

# nucleotide
if [ $DATA_TYPE -eq 1 ]
then
   if (($RATE_VARIATION < 2))
  then
    echo '(echo 1; echo '$FN'; echo '$RATE_VARIATION'; echo '$RESULTS_FN'; echo '$SNAPSHOT_FILE';) | mpirun -np 16 '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $GARD''
    (echo 1; echo $FN; echo $RATE_VARIATION; echo $RESULTS_FN; echo $SNAPSHOT_FILE;) | mpirun -np 16 $HYPHY -i LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
  else
    echo '(echo 1; echo '$FN'; echo '$RATE_VARIATION'; echo '$RATE_CLASSES'; echo '$RESULTS_FN'; echo '$SNAPSHOT_FILE') | mpirun -np 16 '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $GARD''
    (echo 1; echo $FN; echo $RATE_VARIATION; echo $RATE_CLASSES; echo $RESULTS_FN; $SNAPSHOT_FILE;) | mpirun -np 16 $HYPHY -i LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
  fi
fi

# protein
if [ $DATA_TYPE -eq 2 ]
then
   if (($RATE_VARIATION < 2))
  then
    echo '(echo 2; echo '$FN'; echo '$SUBSTITUTION_MODEL'; echo '$RATE_VARIATION'; echo '$RESULTS_FN'; echo '$SNAPSHOT_FILE';) | mpirun -np 16 '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $GARD''
    (echo 2; echo $FN; echo $SUBSTITUTION_MODEL; echo $RATE_VARIATION; echo $RESULTS_FN; echo $SNAPSHOT_FILE;) | mpirun -np 16 $HYPHY -i LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
  else
    echo '(echo 2; echo '$FN'; echo '$SUBSTITUTION_MODEL'; echo '$RATE_VARIATION'; echo '$RATE_CLASSES'; echo '$RESULTS_FN'; echo '$SNAPSHOT_FILE';) | '$HYPHY' -i LIBPATH='$HYPHY_PATH' ' $GARD''
    (echo 2; echo $FN; echo $SUBSTITUTION_MODEL; echo $RATE_VARIATION; echo $RATE_CLASSES; echo $RESULTS_FN; echo $SNAPSHOT_FILE;) | $HYPHY -i LIBPATH=$HYPHY_PATH $GARD > $PROGRESS_FILE
  fi
fi

echo "Completed" > $STATUS_FILE


