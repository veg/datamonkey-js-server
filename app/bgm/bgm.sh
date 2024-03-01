#!/bin/bash
#PBS -l nodes=1:ppn=16

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0
module load openmpi/gnu/3.1.6

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code
DATATYPE=$datatype
SUBSTITUTION_MODEL=$substitution_model
LENGTH=$length_of_each_chain
BURNIN=$number_of_burn_in_samples
SAMPLES=$number_of_samples
MAXIMUM_PARENTS=$maximum_parents_per_node
MINIMUM_SUBSTITUTIONS=$minimum_subs_per_site 

HYPHY=$CWD/../../.hyphy/HYPHYMP
HYPHY_PATH=$CWD/../../.hyphy/res/
BGM=$HYPHY_PATH/TemplateBatchFiles/BGM.bf
RESULTS_FILE=$fn.BGM.json
PVAL="0.1"

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

if [ $DATATYPE == "nucleotide" ]; then
  # Nucleotide data
  echo "$HYPHY -i LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BGM --branches "All" --code $GENETIC_CODE --type $DATATYPE --alignment $FN --tree $TREE_FN --steps $LENGTH --burn-in $BURNIN --samples $SAMPLES --max-parents $MAXIMUM_PARENTS --min-subs $MINIMUM_SUBSTITUTIONS --output $RESULTS_FILE"
  $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BGM --branches "All" --code $GENETIC_CODE --type $DATATYPE --alignment $FN --tree $TREE_FN --steps $LENGTH --burn-in $BURNIN --samples $SAMPLES --max-parents $MAXIMUM_PARENTS --min-subs $MINIMUM_SUBSTITUTIONS --output $RESULTS_FILE >> $PROGRESS_FILE

elif [ $DATATYPE == "amino-acid" ]; then
  # Amino acid
  echo "$HYPHY -i LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BGM --branches "All" --code $GENETIC_CODE --baseline_model $SUBSTITUTION_MODEL --type $DATATYPE --alignment $FN --tree $TREE_FN --steps $LENGTH --burn-in $BURNIN --samples $SAMPLES --max-parents $MAXIMUM_PARENTS --min-subs $MINIMUM_SUBSTITUTIONS --output $RESULTS_FILE"
  $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BGM --branches "All" --code $GENETIC_CODE --baseline_model $SUBSTITUTION_MODEL --type $DATATYPE --alignment $FN --tree $TREE_FN --steps $LENGTH --burn-in $BURNIN --samples $SAMPLES --max-parents $MAXIMUM_PARENTS --min-subs $MINIMUM_SUBSTITUTIONS --output $RESULTS_FILE >> $PROGRESS_FILE

else
  # Codon
  echo "$HYPHY -i LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BGM --branches "All" --code $GENETIC_CODE --type $DATATYPE --alignment $FN --tree $TREE_FN --steps $LENGTH --burn-in $BURNIN --samples $SAMPLES --max-parents $MAXIMUM_PARENTS --min-subs $MINIMUM_SUBSTITUTIONS --output $RESULTS_FILE"
  $HYPHY LIBPATH=$HYPHY_PATH ENV="TOLERATE_NUMERICAL_ERRORS=1;" $BGM --branches "All" --code $GENETIC_CODE --type $DATATYPE --alignment $FN --tree $TREE_FN --steps $LENGTH --burn-in $BURNIN --samples $SAMPLES --max-parents $MAXIMUM_PARENTS --min-subs $MINIMUM_SUBSTITUTIONS --output $RESULTS_FILE >> $PROGRESS_FILE

fi

echo "Completed" > $STATUS_FILE
