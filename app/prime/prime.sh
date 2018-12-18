#!/bin/bash
#PBS -l nodes=1:ppn=8

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load openmpi/gnu/1.6.3
module load aocc/1.2.1

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy/HYPHYMP
HYPHYMPI=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/

PRIME_FITGLOBAL=$CWD/PRIME/PRIME_FITGLOBAL.bf
PRIME=$CWD/PRIME/PRIME.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

#filename
#tree mode
#genetic code
#posterior p

cp $FN $FN.seq
cp $TREE_FN $FN.trees
touch $FN.progress

POSTERIOR_P="0.1"
TREE_MODE=0

echo '(echo '$FN'; echo '$FN';echo 1;echo '$FN'; echo '$TREE_FN') | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $PRIME_FITGLOBAL''
(echo $FN; echo $FN; echo 1;echo $FN; echo $TREE_FN) | $HYPHY LIBPATH=$HYPHY_PATH $PRIME_FITGLOBAL > $PROGRESS_FILE

echo '(echo '$FN'; echo 0; echo 0;echo '$POSTERIOR_P';echo 1;echo '$TREE_MODE';) | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $PRIME''
(echo $FN; echo 0;echo 0;echo $POSTERIOR_P;echo 1;echo $TREE_MODE;) | $HYPHY $PRIME > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE

