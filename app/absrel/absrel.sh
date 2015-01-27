#!/bin/bash
#PBS -l nodes=10:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../node_modules/hyphy/HYPHYMP
#ABSREL=$CWD/../../node_modules/hyphy/res/TemplateBatchFiles/BranchSiteREL.bf
ABSREL=$CWD/BranchSiteREL.bf
#export HYPHY_PATH=$CWD/../../node_modules/hyphy/res/

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
cp /home/sweaver/test.absrel.json $RESULTS_FN
sleep 5;
#echo '(echo '$GENETIC_CODE'; echo 1; echo 1; echo '$FN'; echo '$TREE_FN'; echo '$RESULTS_FN') | '$HYPHY' '$ABSREL''
#export HYPHY_PATH=$CWD/../../node_modules/hyphy/res/; (echo $GENETIC_CODE; echo 1; echo 1; echo $FN; echo $TREE_FN; echo $RESULTS_FN) | $HYPHY $ABSREL
