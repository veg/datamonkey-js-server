#!/bin/bash

source /etc/profile
echo "Initiating difFUBAR analysis"
echo "Current directory: $PWD"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "Script directory: $SCRIPT_DIR"

# Parse command line arguments
if [ $# -lt 11 ]; then
    echo "Usage: $0 <fn> <tree_fn> <sfn> <pfn> <rfn> <pos_threshold> <mcmc_iterations> <burnin_samples> <concentration_of_dirichlet_prior> <julia_path> <julia_project>"
    echo "Example: $0 /path/to/alignment /path/to/tree /path/to/status /path/to/progress /path/to/results 0.95 2500 500 0.5 /usr/local/bin/julia /path/to/project"
    exit 1
fi

# Assign arguments to variables
FN="$1"
TREE_FN="$2"
SFN="$3"
PFN="$4"
RFN="$5"
POS_THRESHOLD="$6"
MCMC_ITERATIONS="$7"
BURNIN_SAMPLES="$8"
CONCENTRATION_OF_DIRICHLET_PRIOR="$9"
JULIA_PATH="${10}"
JULIA_PROJECT="${11}"

echo "=== DIFUBAR PARAMETERS ==="
echo "Alignment file: $FN"
echo "Tree file: $TREE_FN"
echo "Status file: $SFN"
echo "Progress file: $PFN"
echo "Results file: $RFN"
echo "Positive threshold: $POS_THRESHOLD"
echo "MCMC iterations: $MCMC_ITERATIONS"
echo "Burnin samples: $BURNIN_SAMPLES"
echo "Dirichlet concentration: $CONCENTRATION_OF_DIRICHLET_PRIOR"
echo "Julia path: $JULIA_PATH"
echo "Julia project: $JULIA_PROJECT"
echo "=========================="

# Change to the script directory for relative paths
cd "$SCRIPT_DIR"
echo "Changed to directory: $PWD"

# Start the analysis - append to status file instead of overwriting
echo "[BASH] starting difFUBAR" >> "$SFN"
echo "info" > "$PFN"

echo "Running difFUBAR analysis with Julia..."

# Create log files for stdout and stderr
STDOUT_LOG="${RFN}.stdout.log"
STDERR_LOG="${RFN}.stderr.log"

echo "Stdout log: $STDOUT_LOG"
echo "Stderr log: $STDERR_LOG"

# Run Julia analysis with command line arguments and capture output
echo "=== EXECUTING JULIA COMMAND ===" | tee -a "$STDOUT_LOG"
echo "Command: $JULIA_PATH --project=\"$JULIA_PROJECT\" difFubar_analysis.jl ..." | tee -a "$STDOUT_LOG"
echo "==================================" | tee -a "$STDOUT_LOG"

"$JULIA_PATH" --project="$JULIA_PROJECT" "$SCRIPT_DIR/difFubar_analysis.jl" \
  "$FN" \
  "$TREE_FN" \
  "$RFN" \
  "$SFN" \
  "$POS_THRESHOLD" \
  "$MCMC_ITERATIONS" \
  "$BURNIN_SAMPLES" \
  "$CONCENTRATION_OF_DIRICHLET_PRIOR" \
  2>&1 | tee -a "$STDOUT_LOG"

# Capture exit code
JULIA_EXIT_CODE=${PIPESTATUS[0]}

echo "Julia exit code: $JULIA_EXIT_CODE"

# Print the Julia command for debugging
echo "=== DEBUGGING COMMAND ==="
echo "cd $SCRIPT_DIR && $JULIA_PATH --project=\"$JULIA_PROJECT\" difFubar_analysis.jl \\"
echo "  \"$FN\" \\"
echo "  \"$TREE_FN\" \\"
echo "  \"$RFN\" \\"
echo "  \"$SFN\" \\"
echo "  \"$POS_THRESHOLD\" \\"
echo "  \"$MCMC_ITERATIONS\" \\"
echo "  \"$BURNIN_SAMPLES\" \\"
echo "  \"$CONCENTRATION_OF_DIRICHLET_PRIOR\""
echo "========================="

# Append final status to status file
echo "[BASH] difFUBAR analysis completed with exit code: $JULIA_EXIT_CODE" >> "$SFN"

echo "difFUBAR analysis completed with exit code: $JULIA_EXIT_CODE"
exit $JULIA_EXIT_CODE