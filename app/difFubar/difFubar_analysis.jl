using MolecularEvolution, FASTX, CodonMolecularEvolution, JSON

# Get parameters from command line arguments
if length(ARGS) < 8
    println("Usage: julia difFubar_analysis.jl <fn> <tree_fn> <rfn> <sfn> <pos_threshold> <mcmc_iterations> <burnin_samples> <concentration_of_dirichlet_prior>")
    println("Example: julia difFubar_analysis.jl /path/to/alignment /path/to/tree /path/to/results /path/to/status 0.95 2500 500 0.5")
    exit(1)
end

fn = ARGS[1]
tree_fn = ARGS[2]
rfn = ARGS[3]
sfn = ARGS[4]
pos_threshold = parse(Float64, ARGS[5])
mcmc_iterations = parse(Int, ARGS[6])
burnin_samples = parse(Int, ARGS[7])
concentration_of_dirichlet_prior = parse(Float64, ARGS[8])

println("=== JULIA DIFUBAR PARAMETERS ===")
println("Alignment file: $fn")
println("Tree file: $tree_fn")
println("Results file: $rfn")
println("Status file: $sfn")
println("Positive threshold: $pos_threshold")
println("MCMC iterations: $mcmc_iterations")
println("Burnin samples: $burnin_samples")
println("Dirichlet concentration: $concentration_of_dirichlet_prior")
println("===================================")

try
    # Read input files
    println("Reading input files...")
    println("Attempting to read: $fn")
    
    # Check if file exists and determine format
    if isfile(fn)
        file_content = read(fn, String)
        if occursin("#NEXUS", file_content)
            println("Detected NEXUS format, parsing sequences...")
            
            # Handle different line endings (Unix \n, Windows \r\n, Mac \r)
            lines = split(replace(file_content, '\r' => '\n'), '\n')
            seqnames = String[]
            seqs = String[]
            
            # First, extract taxon names from TAXLABELS
            in_taxa = false
            for line in lines
                line = strip(line)
                if occursin("TAXLABELS", uppercase(line))
                    in_taxa = true
                    # Check if labels are on the same line
                    if occursin(";", line)
                        labels_part = split(line, "TAXLABELS")[2]
                        labels_part = replace(labels_part, ";" => "")
                        taxa = split(strip(labels_part))
                        for taxon in taxa
                            if !isempty(strip(taxon))
                                # Remove quotes from taxon names
                                clean_taxon = replace(strip(taxon), "'" => "")
                                if !isempty(clean_taxon)
                                    push!(seqnames, clean_taxon)
                                end
                            end
                        end
                        break
                    end
                    continue
                elseif in_taxa
                    if occursin(";", line)
                        # Last line of taxa
                        labels_part = replace(line, ";" => "")
                        taxa = split(strip(labels_part))
                        for taxon in taxa
                            if !isempty(strip(taxon))
                                # Remove quotes from taxon names
                                clean_taxon = replace(strip(taxon), "'" => "")
                                if !isempty(clean_taxon)
                                    push!(seqnames, clean_taxon)
                                end
                            end
                        end
                        break
                    else
                        # Continue reading taxa
                        taxa = split(strip(line))
                        for taxon in taxa
                            if !isempty(strip(taxon))
                                # Remove quotes from taxon names
                                clean_taxon = replace(strip(taxon), "'" => "")
                                if !isempty(clean_taxon)
                                    push!(seqnames, clean_taxon)
                                end
                            end
                        end
                    end
                end
            end
            
            println("Found $(length(seqnames)) taxa: $(seqnames)")
            
            # Then extract sequences from MATRIX
            in_matrix = false
            for line in lines
                line = strip(line)
                if occursin("MATRIX", uppercase(line))
                    in_matrix = true
                    continue
                elseif occursin("END;", line) && in_matrix
                    break
                elseif in_matrix && !isempty(line) && !startswith(line, ";")
                    # This could be either:
                    # 1. NOLABELS format: just sequence
                    # 2. Labeled format: 'taxon_name' sequence_data
                    
                    seq = strip(line)
                    # Remove any trailing semicolon that might be part of END; statement
                    seq = replace(seq, ";" => "")
                    
                    # Check if this line starts with a quoted taxon name
                    if startswith(seq, "'") || startswith(seq, "\"")
                        # Labeled format: extract sequence part after taxon name
                        # Find the end of the quoted name
                        quote_char = seq[1]
                        end_quote = findnext(quote_char, seq, 2)
                        if end_quote !== nothing
                            # Extract sequence part after the taxon name and any whitespace
                            seq_part = strip(seq[end_quote+1:end])
                            if !isempty(seq_part)
                                push!(seqs, seq_part)
                            end
                        end
                    else
                        # NOLABELS format: entire line is sequence
                        if !isempty(seq)
                            push!(seqs, seq)
                        end
                    end
                end
            end
            
            println("Found $(length(seqs)) sequences")
            
            if length(seqnames) != length(seqs)
                error("Mismatch: $(length(seqnames)) taxa but $(length(seqs)) sequences")
            end
            
            if isempty(seqnames)
                error("No sequences found in NEXUS file")
            end
        else
            # Try as FASTA
            println("Trying to read as FASTA format...")
            seqnames, seqs = read_fasta(fn)
        end
    elseif isfile("$(fn).fasta")
        # Fallback to .fasta extension
        println("Trying $(fn).fasta...")
        seqnames, seqs = read_fasta("$(fn).fasta")
    else
        error("Input file not found: $fn or $(fn).fasta")
    end
    
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

    for (name, seq) in zip(seqnames, seqs)
        println("$(name): length = $(length(seq))")
    end
    
    # Run difFUBAR analysis
    df, results, plots = difFUBAR(
        seqnames, seqs, treestring, tags, rfn,
        pos_thresh=pos_threshold, 
        iters=mcmc_iterations, 
        verbosity=1, 
        exports=true
    )
    
    # Save plot objects for visualization
    println("Saving visualization data...")
    
    # Try to save plots if they exist and have savefig method
    try
        if hasproperty(plots, :overview)
            savefig(plots.overview, "$(rfn)_overview.png")
            savefig(plots.overview, "$(rfn)_overview.svg")
            println("  - $(rfn)_overview.png")
            println("  - $(rfn)_overview.svg")
        end
        if hasproperty(plots, :posterior_alpha_and_omegas)
            savefig(plots.posterior_alpha_and_omegas, "$(rfn)_posteriors.png")
            savefig(plots.posterior_alpha_and_omegas, "$(rfn)_posteriors.svg")
            println("  - $(rfn)_posteriors.png")
            println("  - $(rfn)_posteriors.svg")
        end
        if hasproperty(plots, :detections)
            savefig(plots.detections, "$(rfn)_detections.png")
            savefig(plots.detections, "$(rfn)_detections.svg")
            println("  - $(rfn)_detections.png")
            println("  - $(rfn)_detections.svg")
        end
    catch e
        println("Note: Could not save plot images: $e")
    end
    
    # Write completion status (append, don't overwrite)
    open(sfn, "a") do f
        write(f, "\n[JULIA] completed")
    end
    println("\ndifFUBAR analysis completed successfully")
    println("Sites analyzed: $(size(df, 1))")
    println("Sites with differential selection: $(sum(df[!, "P(ω1 > ω2)"] .> pos_threshold) + sum(df[!, "P(ω2 > ω1)"] .> pos_threshold))")
    println("Output files created:")
    println("  - $(rfn).json")
    println("  - $(rfn)_posteriors.csv")
    
catch e
    # Write error status with informative message (append, don't overwrite)
    error_msg = "\n[JULIA] error: $e"
    open(sfn, "a") do f
        write(f, error_msg)
    end
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
