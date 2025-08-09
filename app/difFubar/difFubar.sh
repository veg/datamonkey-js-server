#!/bin/bash

source /etc/profile
echo "Initiating difFUBAR analysis"
echo "Current directory: $PWD"

# Get variables from environment (SLURM) or command line arguments (local)
if [ $# -ge 10 ]; then
    # Command line arguments (local execution)
    FN="$1"
    TREE_FN="$2"
    RFN="$3"
    PFN="$4"
    POS_THRESHOLD="$5"
    MCMC_ITERATIONS="$6"
    BURNIN_SAMPLES="$7"
    CONCENTRATION_OF_DIRICHLET_PRIOR="$8"
    JULIA_PATH="$9"
    JULIA_PROJECT="${10}"
    # For local execution, use the script directory
    CWD="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
else
    # Environment variables (SLURM execution)
    FN=$fn
    TREE_FN=$tree_fn
    RFN=$rfn
    PFN=$pfn
    POS_THRESHOLD=$pos_threshold
    MCMC_ITERATIONS=$mcmc_iterations
    BURNIN_SAMPLES=$burnin_samples
    CONCENTRATION_OF_DIRICHLET_PRIOR=$concentration_of_dirichlet_prior
    JULIA_PATH=$julia_path
    JULIA_PROJECT=$julia_project
    # Get the working directory from environment
    CWD=$cwd
fi

# Get the directory where this script is located
# For SLURM execution, use CWD which is passed as environment variable
if [ -n "$CWD" ]; then
    SCRIPT_DIR="$CWD"
else
    # For local execution, get directory from script location
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
fi
echo "Script directory: $SCRIPT_DIR"

echo "=== DIFUBAR PARAMETERS ==="
echo "Alignment file: $FN"
echo "Tree file: $TREE_FN"
echo "Results file: $RFN"
echo "Progress file: $PFN"
echo "Positive threshold: $POS_THRESHOLD"
echo "MCMC iterations: $MCMC_ITERATIONS"
echo "Burnin samples: $BURNIN_SAMPLES"
echo "Dirichlet concentration: $CONCENTRATION_OF_DIRICHLET_PRIOR"
echo "Julia path: $JULIA_PATH"
echo "Julia project: $JULIA_PROJECT"
echo "=========================="

# Julia project path is now absolute in config, no conversion needed
echo "Julia project path: $JULIA_PROJECT"

# Change to the script directory for relative paths
cd "$SCRIPT_DIR"
echo "Changed to directory: $PWD"

# Initialize the progress file (single source of status updates)
echo "[BASH] Initializing difFUBAR analysis..." > "$PFN"
echo "[BASH] Starting Julia analysis..." >> "$PFN"

echo "Running difFUBAR analysis with Julia..."

# Set Julia environment variables to avoid conflicts
export JULIA_DEPOT_PATH="$HOME/.julia"
export JULIA_NUM_THREADS=1

# No longer need to clear compilation cache with Julia 1.11.6

echo "Julia depot path: $JULIA_DEPOT_PATH"
echo "Julia project path: $JULIA_PROJECT"

# Skip instantiation if already done (packages are preinstalled)
echo "[BASH] Using Julia environment: $JULIA_PROJECT" >> "$PFN"

# Run Julia analysis - redirect output to progress file for unified status monitoring
"$JULIA_PATH" --project="$JULIA_PROJECT" "$SCRIPT_DIR/difFubar_analysis.jl" \
  "$FN" \
  "$TREE_FN" \
  "$RFN" \
  "$PFN" \
  "$POS_THRESHOLD" \
  "$MCMC_ITERATIONS" \
  "$BURNIN_SAMPLES" \
  "$CONCENTRATION_OF_DIRICHLET_PRIOR" \
  >> "$PFN" 2>&1

# Capture exit code
JULIA_EXIT_CODE=$?

echo "Julia exit code: $JULIA_EXIT_CODE"

# Append final status to progress file (unified status monitoring)
echo "[BASH] Analysis completed with exit code: $JULIA_EXIT_CODE" >> "$PFN"

echo "difFUBAR analysis completed with exit code: $JULIA_EXIT_CODE"
exit $JULIA_EXIT_CODE
