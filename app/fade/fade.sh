#!/bin/bash
#PBS -l nodes=1:ppn=48

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.2.1

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy/HYPHYMP
HYPHY_PATH=$CWD/../../.hyphy/res/
GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf
GRIDPOINTS=$number_of_grid_points
POSTERIORESTIMATIONMETHOD=1
CHAINS=$number_of_mcmc_chains
LENGTH=$length_of_each_chain
BURNIN=$number_of_burn_in_samples
SAMPLES=$number_of_samples
CONCENTRATION=$concentration_of_dirichlet_prior
FGBranchOption=5
AllBranchOption=1
WAGSubstitutionModel=2

FADE=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FADE.bf

export HYPHY_PATH=$HYPHY_PATH
trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
count=$(echo '(echo '$TREE_FN') | '$HYPHY' '$GETCOUNT'' 2> /dev/null)

if [ $count -eq 2]
then
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo '$GRIDPOINTS'; echo '$POSTERIORESTIMATIONMETHOD'; echo '$CHAINS'; echo '$LENGTH'; echo '$BURNIN'; echo '$SAMPLES'; echo '$CONCENTRATION';) | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $FADE''
  (echo echo $FN; echo $TREE_FN; echo $FGBranchOption; echo $GRIDPOINTS; echo $WAGSubstitutionModel; echo $POSTERIORESTIMATIONMETHOD; echo $CHAINS; echo $LENGTH; echo $BURNIN; echo $SAMPLES; echo $CONCENTRATION;) | $HYPHY LIBPATH=$HYPHY_PATH $FADE > $PROGRESS_FILE
else
  echo '(echo '$GENETIC_CODE'; echo '$FN'; echo '$TREE_FN'; echo '$GRIDPOINTS'; echo '$POSTERIORESTIMATIONMETHOD'; echo '$CHAINS'; echo '$LENGTH'; echo '$BURNIN'; echo '$SAMPLES'; echo '$CONCENTRATION';) | '$HYPHY' LIBPATH='$HYPHY_PATH' ' $FADE''
  (echo echo $FN; echo $TREE_FN; echo $AllBranchOption; echo $GRIDPOINTS; echo $WAGSubstitutionModel; echo $POSTERIORESTIMATIONMETHOD; echo $CHAINS; echo $LENGTH; echo $BURNIN; echo $SAMPLES; echo $CONCENTRATION;) | $HYPHY LIBPATH=$HYPHY_PATH $FADE > $PROGRESS_FILE
fi

echo "Completed" > $STATUS_FILE
