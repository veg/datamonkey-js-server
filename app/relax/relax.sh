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

HYPHY=$CWD/../../.hyphy/HYPHYMP
RESULT_FILE=$fn.RELAX.json

export HYPHY_PATH=$CWD/../../.hyphy/res/
RELAX=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/RELAX.bf

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo '(echo '$GENETIC_CODE') | '$HYPHY' -i LIBPATH='$HYPHY_PATH' '$RELAX' --alignment '$FN' --tree '$TREE_FN' --mode "Classic mode" --test TEST --reference REFERENCE --models "All" --rates '$OMEGA_RATE_CLASSES' --output '$RESULT_FILE' > '$PROGRESS_FILE''
sh -c '(echo '$GENETIC_CODE') | '$HYPHY' -i LIBPATH='$HYPHY_PATH' '$RELAX' --alignment '$FN' --tree '$TREE_FN' --mode "Classic mode" --test TEST --reference REFERENCE --models "All" --rates '$OMEGA_RATE_CLASSES' --output '$RESULT_FILE' > '$PROGRESS_FILE''
