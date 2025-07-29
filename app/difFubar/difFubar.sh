#!/bin/bash

source /etc/profile
echo "Initiating difFUBAR analysis"
echo $PWD

# Get the directory where this script is located FIRST
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "Script directory: $SCRIPT_DIR"

# Parse command line arguments in the format key=value
echo "=== DEBUGGING ARGUMENT PARSING ===" >&2
echo "Total arguments received: $#" >&2
echo "All arguments: $@" >&2

for arg in "$@"; do
    echo "Processing argument: $arg" >&2
    if [[ $arg == *"="* ]]; then
        key=$(echo $arg | cut -d'=' -f1)
        value=$(echo $arg | cut -d'=' -f2-)
        echo "  Parsed key='$key' value='$value'" >&2
        
        # Convert relative paths to absolute paths
        if [[ $key == *"fn" ]] || [[ $key == *"_fn" ]]; then
            if [[ ! "$value" = /* ]]; then
                old_value="$value"
                value="$SCRIPT_DIR/$value"
                echo "  Converted relative path: $old_value -> $value" >&2
            fi
        fi
        export $key="$value"
        echo "Set environment variable: $key=$value"
        echo "  Exported: $key=$value" >&2
    else
        echo "  Skipped non-key=value argument: $arg" >&2
    fi
done

echo "=== END ARGUMENT PARSING ===" >&2

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

echo "=== DEBUGGING JULIA SETUP ===" >&2
echo "JULIA_CMD: $JULIA_CMD" >&2
echo "JULIA_PROJECT_PATH: $JULIA_PROJECT_PATH" >&2
echo "Julia script path: $SCRIPT_DIR/difFubar_analysis.jl" >&2

echo "Using Julia: $JULIA_CMD"
echo "Julia project: $JULIA_PROJECT_PATH"

# Verify Julia is available
echo "Checking if Julia exists at: $JULIA_CMD" >&2
if ! command -v "$JULIA_CMD" &> /dev/null; then
    echo "ERROR: Julia not found at $JULIA_CMD" >&2
    echo "Available Julia locations:" >&2
    which julia >&2 || echo "No Julia found in PATH" >&2
    echo "ERROR: Julia not found at $JULIA_CMD" > "$sfn"
    exit 1
else
    echo "✓ Julia found at: $JULIA_CMD" >&2
    "$JULIA_CMD" --version >&2
fi

# Check if Julia project exists
if [ -d "$JULIA_PROJECT_PATH" ]; then
    echo "✓ Julia project directory exists: $JULIA_PROJECT_PATH" >&2
    ls -la "$JULIA_PROJECT_PATH" >&2
else
    echo "ERROR: Julia project directory not found: $JULIA_PROJECT_PATH" >&2
    echo "Current directory contents:" >&2
    ls -la . >&2
fi

# Check if Julia analysis script exists
if [ -f "$SCRIPT_DIR/difFubar_analysis.jl" ]; then
    echo "✓ Julia analysis script exists: $SCRIPT_DIR/difFubar_analysis.jl" >&2
else
    echo "ERROR: Julia analysis script not found: $SCRIPT_DIR/difFubar_analysis.jl" >&2
    echo "Script directory contents:" >&2
    ls -la "$SCRIPT_DIR" >&2
fi

echo "=== STARTING JULIA EXECUTION ===" >&2
echo "Full Julia command: $JULIA_CMD --project=\"$JULIA_PROJECT_PATH\" -t auto \"$SCRIPT_DIR/difFubar_analysis.jl\"" >&2

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