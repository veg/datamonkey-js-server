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

HYPHY=$CWD/../../.hyphy-2.3.3/HYPHYMP
HYPHY_PATH=$CWD/../../.hyphy-2.3.3/res/

FUBAR=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FUBAR.bf

export HYPHY_PATH=$HYPHY_PATH
trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo '(echo '$GENETIC_CODE'; echo '$FN';) | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $FUBAR''
(echo $GENETIC_CODE; echo $FN;) | $HYPHY LIBPATH=$HYPHY_PATH $FUBAR > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
