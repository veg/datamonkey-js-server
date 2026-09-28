#!/bin/bash
#SBATCH --cpus-per-task=16
#SBATCH --ntasks-per-node=1
#PBS -l nodes=1:ppn=16

# >>> cluster-env (canonical block, pinned verbatim by test/cluster-env.test.js; never edit per wrapper)
# PATH, modules and the OpenMPI/UCX LD_LIBRARY_PATH pin live in app/cluster-env.sh;
# per-site overrides in app/cluster-env.local.sh (gitignored). sbatch/qsub run a
# spooled copy of this script, so $0/BASH_SOURCE are NOT the repo there: anchor on cwd=.
if [ -n "$cwd" ]; then DM_APP_DIR="$cwd/.."
elif [ -n "$SLURM_SUBMIT_DIR" ]; then DM_APP_DIR="$SLURM_SUBMIT_DIR/../.."
elif [ -n "$PBS_O_WORKDIR" ]; then DM_APP_DIR="$PBS_O_WORKDIR/../.."
else DM_APP_DIR="${BASH_SOURCE[0]%/*}/.."
fi
if [ ! -f "$DM_APP_DIR/cluster-env.sh" ]; then
  echo "Error: cluster-env: $DM_APP_DIR/cluster-env.sh not found (cwd='$cwd' SLURM_SUBMIT_DIR='$SLURM_SUBMIT_DIR' PBS_O_WORKDIR='$PBS_O_WORKDIR')" >&2
  DM_STATUS_FN="${sfn:-${fn:+${fn}_status}}"
  if [ -n "$DM_STATUS_FN" ]; then echo "Error" > "$DM_STATUS_FN"; fi
  exit 1
fi
. "$DM_APP_DIR/cluster-env.sh" base
# <<< cluster-env

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
