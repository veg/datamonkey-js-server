#!/bin/bash
#PBS -l nodes=1:ppn=16

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
GRIDPOINTS=$number_of_grid_points
CHAINS=$number_of_mcmc_chains
LENGTH=$length_of_each_chain
BURNIN=$number_of_burn_in_samples
SAMPLES=$number_of_samples
CONCENTRATION=$concentration_of_dirichlet_prior

FUBAR=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FUBAR.bf

export HYPHY_PATH=$HYPHY_PATH
trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo '$GRIDPOINTS'; echo '$CHAINS'; echo '$LENGTH'; echo '$BURNIN'; echo '$SAMPLES'; echo '$CONCENTRATION';) | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $FUBAR''
(echo $GENETIC_CODE; echo $FN; echo $TREE_FN; echo $GRIDPOINTS; echo $CHAINS; echo $LENGTH; echo $BURNIN; echo $SAMPLES; echo $CONCENTRATION;) | $HYPHY LIBPATH=$HYPHY_PATH $FUBAR > $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
