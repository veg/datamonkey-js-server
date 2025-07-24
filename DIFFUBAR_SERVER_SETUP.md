# difFUBAR Server Environment Setup

## Current Environment Assumptions

The `difFubar.sh` script currently assumes:

1. **Julia is available in PATH** - The script calls `julia` directly
2. **Julia project environment exists** - Uses `julia --project`
3. **Required Julia packages are installed** - CodonMolecularEvolution.jl, FASTX, JSON, etc.
4. **Working directory structure** - Script changes to `$cwd` directory

## Required Updates

### 1. Update Makefile

Add these sections to `datamonkey-js-server/Makefile`:

```makefile
# Julia configuration
JULIA_VERSION=1.11
JULIA_PROJECT_DIR=./.julia_env

# Add julia target
julia:
	echo "Setting up Julia environment for difFUBAR"
	@if ! command -v julia &> /dev/null; then \
		echo "Julia not found. Please install Julia $(JULIA_VERSION)+ first"; \
		echo "Visit: https://julialang.org/downloads/"; \
		exit 1; \
	fi
	@mkdir -p $(JULIA_PROJECT_DIR)
	@cd $(JULIA_PROJECT_DIR) && julia -e "using Pkg; Pkg.activate(\".\"); Pkg.add(url=\"https://github.com/MurrellGroup/CodonMolecularEvolution.jl\"); Pkg.add(\"FASTX\"); Pkg.add(\"JSON\"); Pkg.add(\"MolecularEvolution\")"

# Update directories target
directories:
	mkdir -p app/absrel/output
	mkdir -p app/bgm/output
	mkdir -p app/busted/output
	mkdir -p app/difFubar/output  # Add this line
	mkdir -p app/fade/output
	# ... rest of directories

# Update install target
install: hyphy hyphy-analyses hivtrace npm julia directories
```

### 2. Update config.json.tpl

Add difFUBAR configuration parameters:

```json
{
  // ... existing config ...
  
  "difFubar_procs"            : "8",
  "difFubar_walltime"         : "24:00:00",
  "difFubar_nodes"            : "1",
  "difFubar_memory"           : "32GB",
  "julia_path"                : "/usr/local/bin/julia",
  "julia_project"             : "./.julia_env",
  
  // ... rest of config
}
```

### 3. Update difFubar.sh for Production

The shell script needs these environment setup additions:

```bash
#!/bin/bash

source /etc/profile

# Julia environment setup
export JULIA_PROJECT="${JULIA_PROJECT:-/path/to/datamonkey-js-server/.julia_env}"
export JULIA_NUM_THREADS="${JULIA_NUM_THREADS:-auto}"

# Verify Julia is available
if ! command -v julia &> /dev/null; then
    echo "Julia not found in PATH" > $sfn
    exit 1
fi

echo "Initiating difFUBAR analysis"
echo "Julia project: $JULIA_PROJECT"
echo $PWD

# ... rest of script remains the same
```

### 4. Server Environment Variables

Add to server startup script or systemd service:

```bash
# Julia configuration
export JULIA_PROJECT="/path/to/datamonkey-js-server/.julia_env"
export JULIA_NUM_THREADS=auto
export JULIA_DEPOT_PATH="/path/to/julia/depot"  # Optional: for package cache
```

## Installation Steps for Production

### 1. Install Julia on Server

```bash
# Option A: Using juliaup (recommended)
curl -fsSL https://install.julialang.org | sh

# Option B: Manual installation
wget https://julialang-s3.julialang.org/bin/linux/x64/1.11/julia-1.11.5-linux-x86_64.tar.gz
sudo tar -xzf julia-1.11.5-linux-x86_64.tar.gz -C /opt/
sudo ln -s /opt/julia-1.11.5/bin/julia /usr/local/bin/julia
```

### 2. Run Makefile Setup

```bash
cd /path/to/datamonkey-js-server
make julia  # Sets up Julia environment
make directories  # Creates output directories
```

### 3. Verify Installation

```bash
# Test Julia environment
cd .julia_env
julia --project -e "using CodonMolecularEvolution; println(\"✓ difFUBAR ready\")"
```

## Cluster/HPC Considerations

For cluster environments, you may need:

### PBS/Torque Module Loading
```bash
# Add to difFubar.sh if using modules
module load julia/1.11
```

### SLURM Module Loading
```bash
# Add to difFubar.sh for SLURM
module load julia/1.11.5
```

### Singularity Container Option
```bash
# Alternative: Use containerized Julia
singularity exec julia-diffubar.sif julia --project difFubar_analysis.jl
```

## Security Considerations

1. **Package Verification**: Pin specific versions of Julia packages
2. **Resource Limits**: Set memory and CPU limits in cluster configuration
3. **Input Validation**: The shell script should validate file paths and parameters
4. **Sandboxing**: Consider running Julia in a restricted environment

## Testing the Setup

After installation, test with:

```bash
# Create test job
cd app/difFubar
export fn="test_data/test"
export tree_fn="test_data/test.nex"
export rfn="test_output"
export sfn="test_status.txt"
export pfn="test_progress.txt"
export pos_threshold="0.95"
export mcmc_iterations="100"
export burnin_samples="20"
export concentration_of_dirichlet_prior="0.1"
export cwd=$(pwd)

# Run test
./difFubar.sh
```

## Monitoring and Maintenance

1. **Julia Package Updates**: Periodically update packages
   ```bash
   cd .julia_env
   julia --project -e "using Pkg; Pkg.update()"
   ```

2. **Log Monitoring**: Check Julia execution logs for errors
3. **Performance Tracking**: Monitor memory usage and execution times
4. **Version Management**: Track Julia and package versions for reproducibility