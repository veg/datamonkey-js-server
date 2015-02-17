#!/bin/bash
#PBS -l nodes=10:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
CWD=$cwd
PYTHON=$python
PIPELINE=$pipeline
PROGRESS_FILE=$pfn
RESULTS_FILE=$rfn

echo $PYTHON $PIPELINE $FN
$PYTHON $PIPELINE $FN
