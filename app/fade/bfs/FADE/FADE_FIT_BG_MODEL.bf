RequireVersion("2.13");
ExecuteAFile("../lib/GrabBag.bf");

fscanf(stdin,"String", _in_FilePath);
fscanf(stdin,"String", _in_ModelName);

timer = Time (1);

baseFilePath = _in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
timeStamp = baseFilePath + ".time";
alignmentData = baseFilePath + ".seq";
treeData = baseFilePath + ".trees";
auxInfoFile = baseFilePath + ".info";

fscanf (alignmentData, "Raw", dataFileString);
fprintf(stdout, treeData);
fscanf (treeData, "Raw", analysisSpecRaw);
fscanf (auxInfoFile, "Raw", auxInfo);
auxInfo = Eval(auxInfo);

fprintf (timeStamp, CLEAR_FILE, timer);

_modelInfo = _generateProteinModelInfo (_in_ModelName);
longModelName = _getLongModelName (_in_ModelName);
modelNameString = "_customAAModelMatrix";

ExecuteAFile("../lib/_MFReaderAA_.ibf");

fprintf(stdout, _modelInfo);

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
                     
fprintf(stdout, CLEAR_FILE, "\n", status_updates);

ACCEPT_ROOTED_TREES = 1;
populateTrees ("prot_tree", fileCount);

ExecuteCommands(constructLF ("baseLF", "filteredData", "prot_tree", fileCount));
Optimize (base_res, baseLF);

bl = +BranchLength (prot_tree_1, -1);

updateAndWriteStatusJSON ("status_updates", 0, 1, "LogL = " + Format(base_res[1][0],8,2) + ". Tree length = " + Format(bl,8,2) + " subs/site." ,1);

baseFitFile = baseFilePath + ".baseFit";
LIKELIHOOD_FUNCTION_OUTPUT = 7;
fprintf (baseFitFile, CLEAR_FILE, baseLF);

auxInfo ["TREE_LENGTHS"] = {{bl}};
auxInfo ["MODEL_INFO"]   = _modelInfo["Name"];
auxInfo ["ROOTED_TREE"]  = Format (prot_tree_1,1,1);
auxInfo ["SEQUENCES"]    = filteredData_1.species;
fprintf (auxInfoFile, CLEAR_FILE, auxInfo);
