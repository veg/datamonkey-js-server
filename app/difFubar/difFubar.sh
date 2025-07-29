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

# Start the analysis
echo "starting difFUBAR" > "$SFN"
echo "info" > "$PFN"

echo "Running difFUBAR analysis with Julia..."

# Export variables for Julia script
export fn="$FN"
export tree_fn="$TREE_FN"
export sfn="$SFN"
export rfn="$RFN"
export pos_threshold="$POS_THRESHOLD"
export mcmc_iterations="$MCMC_ITERATIONS"
export burnin_samples="$BURNIN_SAMPLES"
export concentration_of_dirichlet_prior="$CONCENTRATION_OF_DIRICHLET_PRIOR"

# Run Julia analysis
"$JULIA_PATH" --project="$JULIA_PROJECT" "$SCRIPT_DIR/difFubar_analysis.jl"

echo "difFUBAR analysis completed"