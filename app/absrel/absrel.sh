#!/bin/bash
#PBS -l nodes=3:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy/HYPHYMP
ABSREL=$CWD/BranchSiteREL.bf

export HYPHY_PATH=$CWD/../../.hyphy/res/

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
echo '(echo '$GENETIC_CODE'; echo 1; echo 1; echo '$FN'; echo '$TREE_FN'; echo '$RESULTS_FN') | '$HYPHY' '$ABSREL''
export HYPHY_PATH=$CWD/../../.hyphy/res/; (echo $GENETIC_CODE; echo 1; echo 1; echo $FN; echo $TREE_FN; echo $RESULTS_FN) | $HYPHY $ABSREL
