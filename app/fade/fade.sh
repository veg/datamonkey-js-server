#!/bin/bash
#PBS -l nodes=1:ppn=16

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0
module load openmpi/gnu/3.1.6

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
USE_TREE_IN_FILE='yes'
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
SUBSTITUTIONMODEL=$substitution_model
POSTERIORESTIMATIONMETHOD=$posterior_estimation_method

HYPHY=$CWD/../../.hyphy/HYPHYMP
HYPHY_PATH=$CWD/../../.hyphy/res/
RESULTS_FILE=$fn.FADE.json
CACHE_FILE=$fn.FADE.cache
GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf
GRIDPOINTS=$number_of_grid_points
CHAINS=$number_of_mcmc_chains
LENGTH=$length_of_each_chain
BURNIN=$number_of_burn_in_samples
SAMPLES=$number_of_samples
CONCENTRATION=$concentration_of_dirichlet_prior
FG_OPTION_NOT_ALL_SELECTED=5
FG_OPTION_ALL_SELECTED=4

FADE=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FADE.bf


export HYPHY_PATH=$HYPHY_PATH
trap 'echo "Error" > $STATUS_FILE; exit 1' ERR
count=$(echo '(echo '$TREE_FN') | '$HYPHY' '$GETCOUNT'' 2> /dev/null)


# Outer if then statment to deal with the different (reduced) menue options if variational bayes is selected as the posterior estimation method
# The two inner if then statments to deal with the differnet order of the branch selection options depending on if all of the branches are selected as FG
if [ $POSTERIORESTIMATIONMETHOD -eq 3 ]
then
  if [ $count -eq 2]
  then
    echo "$HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE"
    $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE > $PROGRESS_FILE
  else
    echo "$HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE"
    $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE > $PROGRESS_FILE
  fi
else
  if [ $count -eq 2]
  then
    echo "$HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE"
    $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE > $PROGRESS_FILE
  else
    echo "$HYPHY -i LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE"
    $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $FADE --alignment $FN --tree $TREE_FN --branches "All" --cache $CACHE_FILE --grid $GRIDPOINTS --model $SUBSTITUTIONMODEL --method $POSTERIORESTIMATIONMETHOD --chain $CHAINS --chains $LENGTH --burn-in $BURNIN --samples $SAMPLES --concentration_parameter $CONCENTRATION --output $RESULTS_FILE > $PROGRESS_FILE
  fi
fi

echo "Completed" > $STATUS_FILE
