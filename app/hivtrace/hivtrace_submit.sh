#!/bin/bash
#SBATCH --cpus-per-task=16
#SBATCH --ntasks-per-node=1
#PBS -l nodes=1:ppn=16

export PATH=/usr/local/bin:$PATH

# Load modules if they exist (for cluster environments)
if type module > /dev/null 2>&1; then
  # Try to load common modules that might be available on the system
  module load openmpi/gnu/1.6.3 2>/dev/null || true
  module load aocc/1.3.0 2>/dev/null || true
fi

# Get environment variables passed from the job submission
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
CUSTOM_REFERENCE_FN=$custom_reference_fn

# Trap errors and report them
trap 'echo "Error" >> $STATUS_FILE ; echo "Error occurred in hivtrace_submit.sh" > $HIVTRACE_LOG ; exit 1' ERR

# Prepare arguments for the PYTHON SCRIPT
ARGS=('-i' $FN '-a' $AMBIGUITY '-r' $REFERENCE '-t' $DISTANCE_THRESHOLD '-m' $MIN_OVERLAP '-g' $FRACTION '-s' $STRIP_DRAMS '-f' $FILTER_EDGES '-u' $REFERENCE_STRIP '--log' $HIVTRACE_LOG)

if [ "$COMPARE_TO_LANL" = "true" ]; then
  ARGS+=('-c')
fi

if [ "$PREALIGNED" = "true" ]; then
  ARGS+=('--skip-alignment')
fi

# Convert array to string for logging
ARGS_STR=$(printf " %s" "${ARGS[@]}")

# Log the command for debugging
echo "Running: $PYTHON $HIVTRACE $ARGS_STR" > $HIVTRACE_LOG

# Execute the command and save output
$PYTHON $HIVTRACE $ARGS > $OUTPUT

# Check if the command succeeded
if [ $? -eq 0 ]; then
  echo "Job completed successfully" >> $HIVTRACE_LOG
else
  echo "Job failed with exit code $?" >> $HIVTRACE_LOG
fi
