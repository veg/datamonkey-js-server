#!/bin/bash
#PBS -l nodes=1:ppn=4
#PBS -l walltime=1:00:00 
 
export PATH=/usr/local/bin:$PATH

module load openmpi/gnu/1.6.3
module load gcc/6.1.0

FN=$fn
AMBIGUITY=$ambiguity_handling
FRACTION=$fraction
REFERENCE=$reference
DISTANCE_THRESHOLD=$dt
MIN_OVERLAP=$mo
STRIP_DRAMS=$strip_drams
COMPARE_TO_LANL=$comparelanl
FILTER_EDGES=$filter
PYTHON=$python
REFERENCE_STRIP=$reference_strip
STATUS_FILE=$fn"_status"
HIVTRACE=$hivtrace
OUTPUT=$output
PREALIGNED=$prealigned
HIVTRACE_LOG=$hivtrace_log

trap 'echo "Error" >> $STATUS_FILE ; do_cleanup failed; exit' ERR

#Call PYTHON SCRIPT
ARGS=('-i' $FN '-a' $AMBIGUITY '-r' $REFERENCE '-t' $DISTANCE_THRESHOLD '-m' $MIN_OVERLAP '-g' $FRACTION '-s' $STRIP_DRAMS '-f' $FILTER_EDGES '-u' $REFERENCE_STRIP '--log' $HIVTRACE_LOG)

if [ $COMPARE_TO_LANL = true ]; then
  ARGS+=('-c')
fi

if [ $PREALIGNED = true ]; then
  ARGS+=('--skip-alignment')
fi

ARGS=$(printf " %s" "${ARGS[@]}") 

echo $PYTHON $HIVTRACE $ARGS
$PYTHON $HIVTRACE $ARGS > $OUTPUT
