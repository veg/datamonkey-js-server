#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0

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

HYPHY=$CWD/../../.hyphy/hyphy
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

if [ $RATE_VARIATION == "None" ]
then
  echo "$HYPHY LIBPATH=$HYPHY_PATH gard --alignment $FN --type $DATA_TYPE --code $GENETIC_CODE --output $RESULTS_FN --output-lf $SNAPSHOT_FILE >> $PROGRESS_FILE"
  $HYPHY LIBPATH=$HYPHY_PATH gard --alignment $FN  --type $DATA_TYPE --code $GENETIC_CODE --output $RESULTS_FN --output-lf $SNAPSHOT_FILE >> $PROGRESS_FILE
else
  echo "$HYPHY LIBPATH=$HYPHY_PATH gard --alignment $FN  --type $DATA_TYPE --code $GENETIC_CODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --output $RESULTS_FN --output-lf $SNAPSHOT_FILE >> $PROGRESS_FILE"
  $HYPHY LIBPATH=$HYPHY_PATH gard --alignment $FN  --type $DATA_TYPE --code $GENETIC_CODE --rv $RATE_VARIATION --rate-classes $RATE_CLASSES --output $RESULTS_FN --output-lf $SNAPSHOT_FILE >> $PROGRESS_FILE
fi

echo "Completed" > $STATUS_FILE
