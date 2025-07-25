using MolecularEvolution, FASTX, CodonMolecularEvolution, JSON

# Get parameters from environment variables
fn = ENV["fn"]
tree_fn = ENV["tree_fn"]
rfn = ENV["rfn"]
sfn = ENV["sfn"]
pos_threshold = parse(Float64, ENV["pos_threshold"])
mcmc_iterations = parse(Int, ENV["mcmc_iterations"])
burnin_samples = parse(Int, ENV["burnin_samples"])
concentration_of_dirichlet_prior = parse(Float64, ENV["concentration_of_dirichlet_prior"])

try
    # Read input files
    println("Reading input files...")
    seqnames, seqs = read_fasta("$(fn).fasta")
    println("✓ Read $(length(seqnames)) sequences")
    
    # Parse tagged tree from NEXUS or Newick file
    if endswith(tree_fn, ".nex") || endswith(tree_fn, ".nexus")
        println("Parsing NEXUS tree with tags...")
        treestring, tags, tag_colors = import_colored_figtree_nexus_as_tagged_tree(tree_fn)
    else
        # For Newick files, look for branch tags in the format {tag}
        println("Parsing Newick tree...")
        treestring = read(tree_fn, String)
        # Extract tags from tree string
        tag_matches = collect(eachmatch(r"\{[^}]+\}", treestring))
        if length(tag_matches) >= 2
            tags = unique([String(m.match) for m in tag_matches])
            println("Found tags in tree: $tags")
        else
            # Default tags if none found
            tags = ["{FG1}", "{FG2}"]
            println("No tags found, using default: $tags")
        end
    end
    
    println("Starting difFUBAR analysis...")
    
    # Run difFUBAR analysis
    df, results, plots = difFUBAR(
        seqnames, seqs, treestring, tags, 
        rfn,
        pos_thresh=pos_threshold, 
        iters=mcmc_iterations, 
        burnin=burnin_samples, 
        concentration=concentration_of_dirichlet_prior,
        verbosity=1, 
        exports=true, 
        exports2json=true
    )
    
    # Save plot objects for visualization
    println("Saving visualization data...")
    
    # Try to save plots if they exist and have savefig method
    try
        if hasproperty(plots, :overview)
            savefig(plots.overview, "$(rfn)_overview.png")
            println("  - $(rfn)_overview.png")
        end
        if hasproperty(plots, :posterior_alpha_and_omegas)
            savefig(plots.posterior_alpha_and_omegas, "$(rfn)_posteriors.png")
            println("  - $(rfn)_posteriors.png")
        end
        if hasproperty(plots, :detections)
            savefig(plots.detections, "$(rfn)_detections.png")
            println("  - $(rfn)_detections.png")
        end
    catch e
        println("Note: Could not save plot images: $e")
    end
    
    # Write completion status
    write(sfn, "completed")
    println("\ndifFUBAR analysis completed successfully")
    println("Sites analyzed: $(size(df, 1))")
    println("Sites with differential selection: $(sum(df[!, "P(ω1 > ω2)"] .> pos_threshold) + sum(df[!, "P(ω2 > ω1)"] .> pos_threshold))")
    println("Output files created:")
    println("  - $(rfn).json")
    println("  - $(rfn)_posteriors.csv")
    
catch e
    # Write error status with informative message
    error_msg = "error: $e"
    write(sfn, error_msg)
    println("\ndifFUBAR analysis failed: $e")
    
    # Provide helpful error messages
    if occursin("LoadError", string(e))
        println("\nPackage loading error - try running 'make julia' from server root")
    elseif occursin("file", lowercase(string(e)))
        println("\nFile error - check that input files exist and are readable")
    elseif occursin("memory", lowercase(string(e)))
        println("\nMemory error - dataset may be too large for available RAM")
    end
    
    exit(1)
end