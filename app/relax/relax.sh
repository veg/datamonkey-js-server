#!/bin/bash

export PATH=/usr/local/bin:$PATH
module load aocc/1.3.0

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
ANALYSIS_TYPE=$analysis_type
OMEGA_RATE_CLASSES=3
KZERO="No"

HYPHY=$CWD/../../.hyphy/HYPHYMP
RESULT_FILE=$fn.RELAX.json

export HYPHY_PATH=$CWD/../../.hyphy/res/
RELAX=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/RELAX.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "$HYPHY LIBPATH=$HYPHY_PATH $RELAX --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --mode "Classic mode" --test TEST --reference REFERENCE --models "All" --rates $OMEGA_RATE_CLASSES  --kill-zero-lengths $KZERO --output $RESULT_FILE"
$HYPHY LIBPATH=$HYPHY_PATH $RELAX --code $GENETIC_CODE --alignment $FN --tree $TREE_FN --mode "Classic mode" --test TEST --reference REFERENCE --models "All" --rates $OMEGA_RATE_CLASSES --kill-zero-lengths $KZERO --output $RESULT_FILE > $PROGRESS_FILE
