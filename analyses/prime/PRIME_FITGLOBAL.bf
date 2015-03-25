RequireVersion  ("2.11");

fscanf(stdin,"String", _in_FilePath);
fscanf(stdin,"Number", _in_GeneticCodeTable);
skipCodeSelectionStep = 1;
ExecuteAFile("../../shared/chooseGeneticCode.def");
ApplyGeneticCodeTable(_in_GeneticCodeTable);
ExecuteAFile("../../shared/globals.ibf");
ExecuteAFile("../../shared/GrabBag.bf");

timer = Time (1);

baseFilePath  		= "spool/"+_in_FilePath;

intermediateHTML = baseFilePath + ".progress";
timeStamp        = baseFilePath + ".time";
alignmentData    = baseFilePath + ".seq";
treeData         = baseFilePath + ".trees";

fscanf(alignmentData, "Raw", dataFileString);
fscanf(treeData, "Raw", analysisSpecRaw);

fprintf (timeStamp, CLEAR_FILE, timer);

ExecuteAFile("../../shared/_MFReader_.ibf");

GLOBAL_FPRINTF_REDIRECT = intermediateHTML;
status_updates = {};

status_updates [_mapNumberToString (Abs(status_updates))] = 
                    {"Phase": "ANALYSIS PRELIMINARIES",
                     "Time": Time(0),
                     "Information": {"00000":"Fitting the nucleotide model to estimate relative branch lengths and nucleotide substitution biases"}};

fprintf(stdout, CLEAR_FILE, "\n", status_updates, "\n");

vectorOfFrequencies = overallFrequencies;

SKIP_HARVEST_FREQ = 1;
LoadFunctionLibrary ("GRM", {"00":"Global"});

populateTrees ("nuc_tree", fileCount);
ExecuteCommands(constructLF ("nucLF", "nucData", "nuc_tree", fileCount));
Optimize (nuc_res, nucLF);


updateAndWriteStatusJSON ("status_updates", 0, 1, "LogL = " + Format(nuc_res[1][0],8,2),1);

ASSUME_REVERSIBLE_MODELS = 1;
OPTIMIZATION_METHOD      = 0;
USE_LAST_RESULTS         = 1;


updateAndWriteStatusJSON ("status_updates", 0, 2, "Retuning branch lengths and nucleotide rate biases under the global MG94 CF3x4 codon model",1);

LoadFunctionLibrary("CF3x4");
LoadFunctionLibrary("BranchSiteTemplate");
LoadFunctionLibrary("ProbabilityDistributions");

AUTOMATICALLY_CONVERT_BRANCH_LENGTHS = 1;

nucCF	= CF3x4	(positionFrequencies, GeneticCodeExclusions);

global omega = 0.25;
PopulateModelMatrix("MGMatrix",  nucCF, "syn", "omega", "");
codon3x4 = BuildCodonFrequencies (nucCF);
Model MG = (MGMatrix, codon3x4, 0);


populateTrees("codon_tree", fileCount);
ExecuteCommands(constructLF ("codonLF", "filteredData", "codon_tree", fileCount));

Optimize(codon_res, codonLF);

updateAndWriteStatusJSON ("status_updates", 0, 3, "Improved Log(L) by " + Format(codon_res[1][0]-nuc_res[1][0],8,2) + " points",1);

for (fid = 1; fid <= fileCount; fid += 1) {
    nuc_lengths = BranchLength   (^("nuc_tree_" + fid),-1); 
    codon_lengths = BranchLength (^("codon_tree_" + fid),-1); 
    bc = Columns (nuc_lengths)-1;
    mx = {bc, 2};
    for (bid = 0; bid < bc; bid += 1) {
        mx [bid][0] = nuc_lengths[bid];
        mx [bid][1] = codon_lengths[bid];
    }
    linear_fit_info = linearFit (mx);
    updateAndWriteStatusJSON  ("status_updates", 0, 3+fid, 
        "Partition " + fid + ": [codon length] = " + Format (linear_fit_info["Slope"], 5,2) + " * [nucleotide length]+ " + Format (linear_fit_info["Intercept"], 5,2) + " (" + Format (linear_fit_info["Correlation"], 5,2) + " correlation)",
        fid == fileCount);
}

codonFitFile = baseFilePath + ".codonFit";
LF_NEXUS_EXPORT_EXTRA      = "\n\npositionalFrequencies = " + positionFrequencies + ";";
LIKELIHOOD_FUNCTION_OUTPUT = 7;
fprintf (codonFitFile, CLEAR_FILE, codonLF);

fprintf (timeStamp, "\n", Time(1), "\n", fileCount);
