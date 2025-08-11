println("=== JULIA STARTUP DEBUG ===")
println("Julia version: $(VERSION)")
println("Working directory: $(pwd())")
println("Number of arguments: $(length(ARGS))")
println("Arguments: $(ARGS)")
println("==========================")

println("Loading packages...")
try
    println("  - Loading MolecularEvolution...")
    using MolecularEvolution
    println("  ✓ MolecularEvolution loaded")
    
    println("  - Loading FASTX...")  
    using FASTX
    println("  ✓ FASTX loaded")
    
    println("  - Loading CodonMolecularEvolution...")
    using CodonMolecularEvolution
    println("  ✓ CodonMolecularEvolution loaded")
    
    println("  - Loading JSON...")
    using JSON
    println("  ✓ JSON loaded")
    
    println("  - Loading Plots...")
    using Plots
    println("  ✓ Plots loaded")
    
    println("  - Loading Measures...")
    using Measures
    println("  ✓ Measures loaded")
    
    println("  - Loading Phylo...")
    using Phylo
    println("  ✓ Phylo loaded")
    
    println("✓ All packages loaded successfully")
catch e
    println("❌ PACKAGE LOADING FAILED: $e")
    println("Stack trace:")
    for (exc, bt) in Base.catch_stack()
        showerror(stdout, exc, bt)
        println()
    end
    exit(1)
end

# Get parameters from command line arguments
println("Checking command line arguments...")
if length(ARGS) < 8
    println("❌ Insufficient arguments provided")
    println("Expected: 8, Got: $(length(ARGS))")
    println("Usage: julia difFubar_analysis.jl <fn> <tree_fn> <rfn> <pfn> <pos_threshold> <mcmc_iterations> <burnin_samples> <concentration_of_dirichlet_prior>")
    println("Example: julia difFubar_analysis.jl /path/to/alignment /path/to/tree /path/to/results /path/to/progress 0.95 2500 500 0.5")
    exit(1)
end
println("✓ Sufficient arguments provided")

# Declare variables in global scope
fn = ""
tree_fn = ""
rfn = ""
pfn = ""
pos_threshold = 0.0
mcmc_iterations = 0
burnin_samples = 0
concentration_of_dirichlet_prior = 0.0

println("Parsing command line arguments...")
try
    global fn = ARGS[1]
    println("  ✓ fn = $fn")
    
    global tree_fn = ARGS[2]
    println("  ✓ tree_fn = $tree_fn")
    
    global rfn = ARGS[3]
    println("  ✓ rfn = $rfn")
    
    global pfn = ARGS[4]
    println("  ✓ pfn = $pfn")
    
    global pos_threshold = parse(Float64, ARGS[5])
    println("  ✓ pos_threshold = $pos_threshold")
    
    global mcmc_iterations = parse(Int, ARGS[6])
    println("  ✓ mcmc_iterations = $mcmc_iterations")
    
    global burnin_samples = parse(Int, ARGS[7])
    println("  ✓ burnin_samples = $burnin_samples")
    
    global concentration_of_dirichlet_prior = parse(Float64, ARGS[8])
    println("  ✓ concentration_of_dirichlet_prior = $concentration_of_dirichlet_prior")
    
    println("✓ All arguments parsed successfully")
catch e
    println("❌ ARGUMENT PARSING FAILED: $e")
    println("Failed argument details:")
    for i in 1:length(ARGS)
        println("  ARGS[$i] = '$(ARGS[i])'")
    end
    exit(1)
end

println("=== JULIA DIFUBAR PARAMETERS ===")
println("Alignment file: $fn")
println("Tree file: $tree_fn")
println("Results file: $rfn")
println("Progress file: $pfn")
println("Positive threshold: $pos_threshold")
println("MCMC iterations: $mcmc_iterations")
println("Burnin samples: $burnin_samples")
println("Dirichlet concentration: $concentration_of_dirichlet_prior")
println("===================================")

try
    # Read input files
    println("=== FILE EXISTENCE CHECKS ===")
    println("Checking alignment file: $fn")
    if isfile(fn)
        file_size = filesize(fn)
        println("  ✓ File exists, size: $file_size bytes")
    else
        println("  ❌ File does not exist")
        # Check alternative locations
        alt_files = ["$(fn).fasta", "$(fn).nex", "$(fn).nexus"]
        for alt in alt_files
            if isfile(alt)
                println("  ℹ️  Found alternative: $alt")
            end
        end
        error("Alignment file not found: $fn")
    end
    
    println("Checking tree file: $tree_fn")
    if isfile(tree_fn)
        file_size = filesize(tree_fn)
        println("  ✓ File exists, size: $file_size bytes")
    else
        println("  ❌ File does not exist")
        error("Tree file not found: $tree_fn")
    end
    
    println("Checking write permissions for output directory...")
    output_dir = dirname(rfn)
    if isdir(output_dir) && iswritable(output_dir)
        println("  ✓ Output directory writable: $output_dir")
    else
        println("  ❌ Output directory not writable or doesn't exist: $output_dir")
        error("Cannot write to output directory: $output_dir")
    end
    println("==============================")
    
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
            
            println("Found $(length(seqnames)) taxa from TAXLABELS: $(seqnames)")
            
            # Then extract sequences from MATRIX
            in_matrix = false
            matrix_seqnames = String[]  # Names extracted from MATRIX section
            matrix_seqs = String[]      # Sequences from MATRIX section
            
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
                        # Labeled format: extract both name and sequence
                        quote_char = seq[1]
                        end_quote = findnext(quote_char, seq, 2)
                        if end_quote !== nothing
                            # Extract taxon name and sequence
                            taxon_name = strip(seq[2:end_quote-1])  # Remove quotes
                            seq_part = strip(seq[end_quote+1:end])
                            if !isempty(seq_part) && !isempty(taxon_name)
                                push!(matrix_seqnames, taxon_name)
                                push!(matrix_seqs, seq_part)
                            end
                        end
                    else
                        # NOLABELS format: use TAXLABELS names with sequence data
                        if !isempty(seq) && length(matrix_seqs) < length(seqnames)
                            push!(matrix_seqs, seq)
                        end
                    end
                end
            end
            
            # Determine which names and sequences to use
            if !isempty(matrix_seqnames)
                # Labeled format: use names and sequences from MATRIX
                seqnames = matrix_seqnames
                seqs = matrix_seqs
                println("Using labeled format with $(length(seqnames)) taxa from MATRIX section")
            else
                # NOLABELS format: use TAXLABELS names with MATRIX sequences
                seqs = matrix_seqs
                println("Using NOLABELS format with $(length(seqnames)) taxa from TAXLABELS section")
            end
            
            # Normalize case for phylogenetic software compatibility
            seqnames = uppercase.(seqnames)
            println("Final taxa names (uppercase): $(seqnames[1:min(5, length(seqnames))])...")
            
            # Check if sequences need case normalization
            has_lowercase = any(seq -> any(islowercase, seq), seqs)
            if has_lowercase
                println("⚠️  Sequences contain lowercase characters, converting to uppercase")
                seqs = uppercase.(seqs)
            else
                println("✓ All sequences are already uppercase")
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
    
    # Validate that sequence names match tree taxa (case-insensitive)
    println("Validating sequence-tree name matching...")
    tree_upper = uppercase(treestring)
    missing_in_tree = String[]
    
    for seqname in seqnames
        if !occursin(seqname, tree_upper)
            push!(missing_in_tree, seqname)
        end
    end
    
    if !isempty(missing_in_tree)
        println("⚠️  WARNING: The following sequence names are not found in the tree:")
        for name in missing_in_tree
            println("  - $name")
        end
        println("This may cause numerical errors during analysis.")
        println("Tree content (first 200 chars): $(treestring[1:min(200, length(treestring))])")
        error("Sequence-tree name mismatch detected. Please ensure all sequence names appear in the tree.")
    else
        println("✓ All sequence names found in tree")
    end
    
    println("=== PRE-ANALYSIS DEBUG ===")
    println("Number of sequences: $(length(seqnames))")
    println("Number of tags: $(length(tags))")
    println("Tags: $tags")
    println("Tree length: $(length(treestring)) chars")
    println("Tree preview: $(treestring[1:min(100, length(treestring))])...")
    
    println("Sequence summary:")
    for (i, (name, seq)) in enumerate(zip(seqnames, seqs))
        if i <= 5  # Only show first 5 sequences in detail
            println("  [$i] $(name): length = $(length(seq))")
            # Check for lowercase characters in sequence
            lowercase_chars = filter(c -> islowercase(c), collect(seq))
            if !isempty(lowercase_chars)
                println("    ⚠️  Contains lowercase: $(unique(lowercase_chars))")
            end
            # Show first 20 characters of sequence
            println("    Sequence: $(seq[1:min(20, length(seq))])...")
        elseif i == 6
            println("  ... (showing first 5 of $(length(seqnames)) sequences)")
        end
    end
    println("==========================")
    
    println("=== STARTING DIFUBAR ANALYSIS ===")
    println("Parameters:")
    println("  - pos_thresh: $pos_threshold")  
    println("  - iters: $mcmc_iterations")
    println("  - burnin: $burnin_samples")
    println("  - concentration: $concentration_of_dirichlet_prior")
    println("  - verbosity: 1")
    println("  - exports: true")
    println("  - exports2json: true")
    println("  - output base: $rfn")
    println("=================================")
    
    # Check if difFUBAR function exists
    if !isdefined(CodonMolecularEvolution, :difFUBAR)
        error("difFUBAR function not found in CodonMolecularEvolution package")
    else
        println("✓ difFUBAR function found")
        # Write progress update to unified progress file
        open(pfn, "a") do f
            write(f, "\n[JULIA] difFUBAR function found")
        end
    end
    
    # Run difFUBAR analysis with error handling
    println("Calling difFUBAR function...")
    
    # Write progress update before starting analysis
    open(pfn, "a") do f
        write(f, "\n[JULIA] Starting difFUBAR analysis...")
    end
    
    # Using the correct Julia environment that supports all parameters
    df, results, plots = difFUBAR(
        seqnames, seqs, treestring, tags, rfn,
        pos_thresh=pos_threshold, 
        iters=mcmc_iterations, 
        burnin=burnin_samples,
        concentration=concentration_of_dirichlet_prior,
        verbosity=1, 
        exports=true,
        exports2json=true
    )
    println("✓ difFUBAR analysis completed successfully")
    
    # Write progress update for completion
    open(pfn, "a") do f
        write(f, "\n[JULIA] difFUBAR analysis completed - processing results...")
    end
    
    # Save plot objects for visualization
    println("Saving visualization data...")
    
    # Try to save plots if they exist and have savefig method
    try
        if plots !== nothing
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
        else
            println("Note: No plots object returned from difFUBAR")
        end
    catch e
        println("Note: Could not save plot images: $e")
    end
    
    # Write completion status to unified progress file
    open(pfn, "a") do f
        write(f, "\n[JULIA] Analysis completed successfully")
    end
    println("\ndifFUBAR analysis completed successfully")
    println("Sites analyzed: $(size(df, 1))")
    println("Sites with differential selection: $(sum(df[!, "P(ω1 > ω2)"] .> pos_threshold) + sum(df[!, "P(ω2 > ω1)"] .> pos_threshold))")
    println("Output files created:")
    println("  - $(rfn).json")
    println("  - $(rfn)_posteriors.csv")
    
catch e
    println("\n❌ ANALYSIS FAILED!")
    println("=== ERROR DETAILS ===")
    println("Error: $e")
    println("Error type: $(typeof(e))")
    
    # Get more detailed error information
    if isa(e, MethodError)
        println("Method Error Details:")
        println("  Function: $(e.f)")
        println("  Arguments: $(length(e.args)) args of types: $(typeof.(e.args))")
    elseif isa(e, LoadError)
        println("Load Error Details:")
        println("  File: $(e.file)")
        println("  Line: $(e.line)")
        println("  Error: $(e.error)")
    elseif isa(e, SystemError)
        println("System Error Details:")
        println("  Prefix: $(e.prefix)")
        println("  Error code: $(e.errnum)")
    end
    
    println("Stack trace:")
    for (exc, bt) in Base.catch_stack()
        showerror(stdout, exc, bt)
        println()
    end
    println("==================")
    
    # Write error status with informative message to unified progress file
    error_msg = "\n[JULIA] error: $e"
    try
        open(pfn, "a") do f
            write(f, error_msg)
        end
        println("✓ Error status written to: $pfn")
    catch write_error
        println("⚠️  Could not write error to progress file: $write_error")
    end
    
    # Provide helpful error messages and diagnostics
    println("\n=== DIAGNOSTIC INFORMATION ===")
    if occursin("LoadError", string(e))
        println("Package loading error - try running 'make julia' from server root")
        println("Check that all required packages are installed in the project environment")
    elseif occursin("file", lowercase(string(e))) || occursin("File", string(e))
        println("File error - check that input files exist and are readable")
        println("Verify file paths and permissions")
    elseif occursin("memory", lowercase(string(e))) || occursin("Memory", string(e))
        println("Memory error - dataset may be too large for available RAM")
        println("Consider reducing MCMC iterations or using a smaller dataset")
    elseif occursin("method", lowercase(string(e))) || isa(e, MethodError)
        println("Method error - function signature mismatch")
        println("Check that the difFUBAR function accepts the provided arguments")
        println("Verify package versions are compatible")
    elseif occursin("bound", lowercase(string(e))) || occursin("index", lowercase(string(e)))
        println("Array bounds error - likely data format issue")
        println("Check sequence alignment format and tree structure")
    else
        println("Unexpected error type")
        println("Check Julia environment and package installations")
    end
    
    println("Current working directory: $(pwd())")
    println("Julia version: $(VERSION)")
    println("Available packages in current environment:")
    try
        using Pkg
        Pkg.status()
    catch pkg_error
        println("Could not list packages: $pkg_error")
    end
    println("==============================")
    
    exit(1)
end
