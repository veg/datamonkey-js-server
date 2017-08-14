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

HYPHY=$CWD/../../.hyphy/HYPHYMP
HYPHYMPI=$CWD/../../.hyphy/HYPHYMPI
HYPHY_PATH=$CWD/../../.hyphy/res/

PRIME=$CWD/PRIME.bf
PRIME_FITGLOBAL=$CWD/PRIME_FITGLOBAL.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

#TODO - Check if there is a supplied tree
#TODO - Allow user to select which branches

#filename
#tree mode
#genetic code
#posterior p

echo '(echo '$FN';echo 1;echo '$FN'; echo '$TREE_FN') | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $PRIME_FITGLOBAL''
(echo $FN; echo $GENETIC_CODE;echo $FN; echo $TREE_FN) | $HYPHY LIBPATH=$HYPHY_PATH $PRIME_FITGLOBAL > $PROGRESS_FILE

echo '(echo '$FN'; echo 0;echo '$POSTERIOR_P';echo 1;echo '$TREE_MODE';) | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $PRIME''
(echo $FN; echo 0;echo 0;echo $POSTERIOR_P;echo 1;echo $TREE_MODE;) | $HYPHYMPI $PRIME > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE

