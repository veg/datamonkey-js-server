#!/bin/bash
#PBS -l nodes=3:ppn=8

FN=$fn
SEQFN=$seq_fn
JSONFN=$json_fn
OUTFN=$out_fn
CWD=$cwd
STATUS_FILE=$sfn
MODEL=$model
FG_MODEL=$fg_model;
CONCENTRATION_PARAMETER=0.5
FADE=$CWD/FADE.bf
HYPHY=$CWD/../../.hyphy/HYPHYMP
HYPHYMPI=$CWD/../../.hyphy/HYPHYMPI

#export HYPHY_PATH=$CWD/../../node_modules/hyphy/res/

trap 'echo "Error" > $STATUS_FILE; exit 1' ERR

cp $FN $SEQFN

echo "(echo $FN; echo $MODEL) | $HYPHY $CWD/bfs/FADE/FADE_FIT_BG_MODEL.bf"
(echo $FN; echo "$MODEL") | $HYPHY $CWD/bfs/FADE/FADE_FIT_BG_MODEL.bf

echo "(echo $FN; echo $FG_MODEL) | mpirun -np 25 $HYPHYMPI $CWD/bfs/FADE/FADE_COMPUTE_GRID.bf"
(echo $FN; echo "$FG_MODEL") | $HYPHY $CWD/bfs/FADE/FADE_COMPUTE_GRID.bf

echo "(echo $FN; echo $CONCENTRATION_PARAMETER) | mpirun -np 25 $HYPHYMPI $CWD/bfs/FADE/FADE_ESTIMATE_WEIGHTS.bf"
(echo $FN; echo $CONCENTRATION_PARAMETER) | $HYPHY $CWD/bfs/FADE/FADE_ESTIMATE_WEIGHTS.bf

echo "(echo $FN) | $HYPHY $CWD/bfs/FADE/FADE_COMPUTE_POSTERIORS.bf"
(echo $FN) | $HYPHY $CWD/bfs/FADE/FADE_COMPUTE_POSTERIORS.bf

echo "(echo $OUTFN) | $HYPHY $CWD/bfs/FADE/FADE_RESULTS_PROCESSOR.bf > $JSONFN"
(echo $OUTFN) | $HYPHY $CWD/bfs/FADE/FADE_RESULTS_PROCESSOR.bf > $JSONFN

