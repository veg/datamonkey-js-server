#!/bin/bash

export PATH=/usr/local/bin:$PATH
source /etc/profile.d/modules.sh

module load aocc/1.3.0

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$rfn
GENETIC_CODE=$genetic_code

HYPHY=$CWD/../../.hyphy/hyphy
HYPHY_PATH=$CWD/../../.hyphy/res/
RESULTS_FILE=$fn.FUBAR.json
CACHE_FILE=$fn.FUBAR.cache
GRIDPOINTS=$number_of_grid_points
CONCENTRATION=$concentration_of_dirichlet_prior

FUBAR=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/FUBAR.bf

export HYPHY_PATH=$HYPHY_PATH
trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

echo "$HYPHY LIBPATH=$HYPHY_PATH fubar --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --output $RESULTS_FN >> $PROGRESS_FILE"
$HYPHY LIBPATH=$HYPHY_PATH fubar --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --output $RESULTS_FN >> $PROGRESS_FILE

echo "Completed" > $STATUS_FILE
