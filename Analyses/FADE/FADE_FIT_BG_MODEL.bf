RequireVersion  ("2.13");
ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");

fscanf  			(stdin,"String", _in_FilePath);
fscanf              (stdin,"String", _in_ModelName);

timer               = Time(1);

timer = Time (1);

baseFilePath  		= "spool/"+_in_FilePath;

intermediateHTML	= baseFilePath + ".progress";
timeStamp           = baseFilePath + ".time";
alignmentData   	= baseFilePath + ".seq";
treeData            = baseFilePath + ".trees";

fscanf (alignmentData, "Raw", dataFileString);
fscanf (treeData,      "Raw", analysisSpecRaw);


fprintf (timeStamp, CLEAR_FILE, timer);

_modelInfo             		= _generateProteinModelInfo (_in_ModelName);
longModelName 				= _getLongModelName (_in_ModelName);
modelNameString				= "_customAAModelMatrix";
ExecuteAFile			    ("../Shared/_MFReaderAA_.ibf");

if (_modelInfo["+F"]) {
    _freqOption = "Estimated";
} else {
    _freqOption = "Empirical";
}

SKIP_FREQ_HARVESTING = 1;
LoadFunctionLibrary ("Custom_AA_empirical", {"0": _modelInfo ["Filepath"],
                                             "1": _freqOption, 
                                             "2": "Fixed Rates"});

if (_modelInfo["+F"]) {
    vectorOfFrequencies = overallFrequencies;
}

Model BG = (_customAAModelMatrix, vectorOfFrequencies);


GLOBAL_FPRINTF_REDIRECT = intermediateHTML;
status_updates = {};
status_updates [_mapNumberToString (Abs(status_updates))] = 
                    {"Phase": "Baseline Model Fit",
                     "Time": Time(1),
                     "Information": {"00000":"Fitting the " + _modelInfo["Name"] +" substitution model to obtain initial branch length estimates"}};
                     
fprintf				(stdout, CLEAR_FILE, "\n", status_updates);

ACCEPT_ROOTED_TREES = 1;
populateTrees ("prot_tree", fileCount);
ExecuteCommands(constructLF ("baseLF", "filteredData", "prot_tree", fileCount));
Optimize (base_res, baseLF);

updateAndWriteStatusJSON ("status_updates", 0, 1, "LogL = " + Format(base_res[1][0],8,2) + ". Tree length = " + Format(+BranchLength (prot_tree_1, -1),8,2) + " subs/site." ,1);

baseFitFile = baseFilePath + ".baseFit";
LIKELIHOOD_FUNCTION_OUTPUT = 7;
fprintf (baseFitFile, CLEAR_FILE, baseLF);

fprintf (timeStamp, CLEAR_FILE, filteredData_1.species, "\n", Time(1), "\n", _modelInfo["Name"], "\n", Format (prot_tree_1,1,1));
