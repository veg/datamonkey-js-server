#!/bin/bash
#PBS -l nodes=3:ppn=8

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
GENETIC_CODE=$genetic_code
ANALYSIS_TYPE=$analysis_type
FG_MODEL=$fg_model
CONCENTRATION_PARAMETER=$concentration_param
HYPHY=$CWD/../../.hyphy/HYPHYMP
FADE=$CWD/FADE.bf
GETCOUNT=$CWD/../../lib/getAnnotatedCount.bf 
export HYPHY_PATH=$CWD/../../node_modules/hyphy/res/

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

(echo $FN; echo $TREEMODE; echo $ROOT_ON) | /usr/local/bin/HYPHYMP ${BASEPATH}FADE_DOWNLOAD.bf >  ${BASEPATH}hpout 2>&1
#(echo $FN; echo $MODEL) | /usr/bin/bpsh `beomap --nolocal -exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP  ${BASEPATH}FADE_FIT_BG_MODEL.bf > ${BASEPATH}hpout 2>&1

## OpenMPI
#(echo $FN; echo $FG_MODEL) | mpirun -np 25 -hostfile $HOSTFILE /usr/local/bin/HYPHYMPI ${BASEPATH}FADE_COMPUTE_GRID.bf > ${BASEPATH}hpout 2>&1
#(echo $FN; echo $CONCENTRATION_PARAMETER) | mpirun -np 21 -hostfile $HOSTFILE /usr/local/bin/HYPHYMPI ${BASEPATH}FADE_ESTIMATE_WEIGHTS.bf > ${BASEPATH}hpout 2>&1


#(echo $1) | /usr/bin/bpsh `beomap --nolocal -exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP  ${BASEPATH}FADE_COMPUTE_POSTERIORS.bf > ${BASEPATH}hpout 2>&1
