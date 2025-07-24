#!/bin/bash

source /etc/profile
echo "Initiating difFUBAR analysis"
echo $PWD

# Change to the working directory
cd $cwd
echo "Changed directory to: $PWD"

# Start the analysis
echo "starting difFUBAR" > $sfn
echo "info" > $pfn

echo "Running difFUBAR analysis with the following parameters:"
echo "Tree file: $tree_fn"
echo "Fasta file: $fn.fasta"
echo "Grid points: $number_of_grid_points"
echo "Dirichlet concentration: $concentration_of_dirichlet_prior"
echo "MCMC iterations: $mcmc_iterations"
echo "Burnin samples: $burnin_samples"
echo "Positive threshold: $pos_threshold"

# Create Julia script for difFUBAR analysis
cat > difFubar_analysis.jl << EOF
using MolecularEvolution, FASTX, CodonMolecularEvolution, JSON

try
    # Read input files
    seqnames, seqs = read_fasta("$fn.fasta")
    
    # Parse tagged tree from NEXUS or Newick file
    if endswith("$tree_fn", ".nex")
        treestring, tags, tag_colors = import_colored_figtree_nexus_as_tagged_tree("$tree_fn")
    else
        # For Newick files, use default tags
        treestring = read("$tree_fn", String)
        tags = ["{FG1}", "{FG2}"]  # Default tags - should be configurable
    end
    
    # Run difFUBAR analysis
    df, results = difFUBAR(
        seqnames, seqs, treestring, tags, 
        "$rfn",
        pos_thresh=$pos_threshold, 
        iters=$mcmc_iterations, 
        burnin=$burnin_samples, 
        concentration=$concentration_of_dirichlet_prior,
        verbosity=1, 
        exports=true, 
        exports2json=true
    )
    
    # Write completion status
    write("$sfn", "completed")
    println("difFUBAR analysis completed successfully")
    println("Sites analyzed: \$(size(df, 1))")
    println("Output files: \$(rfn).json, \$(rfn)_posteriors.csv")
    
catch e
    # Write error status
    write("$sfn", "error: \$e")
    println("difFUBAR analysis failed: \$e")
    exit(1)
end
EOF

# Run Julia analysis
echo "starting Julia analysis" > $sfn
julia --project -t auto difFubar_analysis.jl

# Check if analysis completed successfully
if [ $? -eq 0 ]; then
    echo "difFUBAR analysis completed successfully"
else
    echo "difFUBAR analysis failed" > $sfn
    echo "error: Julia analysis failed" > $rfn
fi