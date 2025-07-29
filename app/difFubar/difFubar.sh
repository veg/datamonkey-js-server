#!/bin/bash

source /etc/profile
echo "Initiating difFUBAR analysis"
echo $PWD

# Get the directory where this script is located FIRST
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "Script directory: $SCRIPT_DIR"

# Parse command line arguments in the format key=value
for arg in "$@"; do
    if [[ $arg == *"="* ]]; then
        key=$(echo $arg | cut -d'=' -f1)
        value=$(echo $arg | cut -d'=' -f2-)
        # Convert relative paths to absolute paths
        if [[ $key == *"fn" ]] || [[ $key == *"_fn" ]]; then
            if [[ ! "$value" = /* ]]; then
                value="$SCRIPT_DIR/$value"
            fi
        fi
        export $key="$value"
        echo "Set environment variable: $key=$value"
    fi
done

# Change to the working directory
cd "$cwd"
echo "Changed directory to: $PWD"

# Start the analysis - use absolute paths
echo "starting difFUBAR" > "$sfn"
echo "info" > "$pfn"

echo "Running difFUBAR analysis with the following parameters:"
echo "Tree file: $tree_fn"
echo "Fasta file: $fn.fasta"
echo "Grid points: $number_of_grid_points"
echo "Dirichlet concentration: $concentration_of_dirichlet_prior"
echo "MCMC iterations: $mcmc_iterations"
echo "Burnin samples: $burnin_samples"
echo "Positive threshold: $pos_threshold"

# Export environment variables for Julia script
export fn tree_fn rfn sfn pos_threshold mcmc_iterations burnin_samples concentration_of_dirichlet_prior

# Use configured Julia path and project environment (SCRIPT_DIR already set above)
JULIA_CMD="${julia_path:-julia}"
JULIA_PROJECT_PATH="${julia_project:-$SCRIPT_DIR/../../.julia_env}"

echo "Using Julia: $JULIA_CMD"
echo "Julia project: $JULIA_PROJECT_PATH"

# Verify Julia is available
if ! command -v "$JULIA_CMD" &> /dev/null; then
    echo "ERROR: Julia not found at $JULIA_CMD" > "$sfn"
    exit 1
fi

# Run Julia analysis
echo "starting Julia analysis" > "$sfn"
"$JULIA_CMD" --project="$JULIA_PROJECT_PATH" -t auto "$SCRIPT_DIR/difFubar_analysis.jl"

# Check if analysis completed successfully
if [ $? -eq 0 ]; then
    echo "✅ difFUBAR analysis completed successfully"
    
    # Verify output files exist
    if [ -f "${rfn}.json" ] && [ -f "${rfn}_posteriors.csv" ]; then
        echo "✓ Output files verified"
    else
        echo "WARNING: Expected output files not found"
    fi
else
    echo "❌ difFUBAR analysis failed"
    if [ -f "$sfn" ]; then
        echo "Error status: $(cat $sfn)"
    fi
    exit 1
fi