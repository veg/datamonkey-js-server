.PHONY: clean all test publish

## Do not specify patch version
HYPHY_VERSION=2.5

# Julia configuration for difFUBAR
JULIA_VERSION=1.11
JULIA_PROJECT_DIR=./.julia_env

TAG:=$(shell git describe --tags `git rev-list --tags --max-count=1` --match="$(HYPHY_VERSION)".*)

all: install

hyphy:
	echo "installing hyphy"
	@if ! test -d ./.hyphy; then git clone http://github.com/veg/hyphy.git ./.hyphy/; fi
	@cd ./.hyphy && git checkout master && cmake -DNOAVX=ON . && make -j 4 hyphy && make -j 4 HYPHYMPI && cd ../

update-hyphy:
	echo "updating hyphy to latest release"
	@cd ./.hyphy && git pull origin master --tags && git checkout $(TAG) && cmake -DNOAVX=ON . && make -j 4 hyphy && make -j 4 HYPHYMPI && cd ../

hyphy-analyses:
	echo "installing hyphy-analyses"
	@if ! test -d ./.hyphy-analyses; then git clone http://github.com/veg/hyphy-analyses.git ./.hyphy-analyses/; fi
	
hivtrace:
	@mkdir -p ./.python
	@virtualenv ./.python/env/
	@./.python/env/bin/pip install numpy
	@./.python/env/bin/pip install biopython
	@./.python/env/bin/pip install cython
	@./.python/env/bin/pip install hivtrace==0.3.2

julia:
	echo "Setting up Julia environment for difFUBAR"
	@if ! command -v julia &> /dev/null; then \
		echo "ERROR: Julia not found. Please install Julia $(JULIA_VERSION)+ first"; \
		echo "Visit: https://julialang.org/downloads/"; \
		echo "Or run: curl -fsSL https://install.julialang.org | sh"; \
		exit 1; \
	fi
	@echo "Creating Julia project environment at $(JULIA_PROJECT_DIR)"
	@mkdir -p $(JULIA_PROJECT_DIR)
	@if [ -f "$(JULIA_PROJECT_DIR)/Project.toml" ]; then \
		echo "Found existing Project.toml, using committed dependencies..."; \
		cd $(JULIA_PROJECT_DIR) && julia --project -e "using Pkg; Pkg.instantiate(); println(\"Dependencies installed from Project.toml\")"; \
	else \
		echo "Creating new Julia environment with required packages..."; \
		cd $(JULIA_PROJECT_DIR) && julia -e "using Pkg; Pkg.activate(\".\"); Pkg.add(url=\"https://github.com/MurrellGroup/CodonMolecularEvolution.jl\", rev=\"main\"); Pkg.add(\"FASTX\"); Pkg.add(\"JSON\"); Pkg.add(\"MolecularEvolution\"); Pkg.add(\"Plots\"); Pkg.add(\"Phylo\"); Pkg.add(\"Measures\")"; \
	fi
	@echo "Julia environment setup complete"
	@cd $(JULIA_PROJECT_DIR) && julia --project -e "using CodonMolecularEvolution, Plots, Phylo, Measures; println(\"✓ difFUBAR with plot generation ready\")"

npm:
	echo "running npm"
	@npm install

directories:
	mkdir -p app/absrel/output
	mkdir -p app/bgm/output
	mkdir -p app/busted/output
	mkdir -p app/difFubar/output
	mkdir -p app/fade/output
	mkdir -p app/fel/output
	mkdir -p app/flea/output
	mkdir -p app/fubar/output
	mkdir -p app/fade/output
	mkdir -p app/gard/output
	mkdir -p app/meme/output
	mkdir -p app/multihit/output
	mkdir -p app/nrm/output
	mkdir -p app/prime/output
	mkdir -p app/relax/output
	mkdir -p app/slac/output
	mkdir -p app/hivtrace/output

install: hyphy hyphy-analyses hivtrace npm julia directories
