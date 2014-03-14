RequireVersion("2.11");

fscanf(stdin, "String", _in_FilePath);
fscanf(stdin, "Number", treeMode);

ExecuteAFile("../../shared/globals.ibf");
ExecuteAFile("../../shared/GrabBag.bf");

// Get base file name of in_FilePath
fn_array = splitFilePath(_in_FilePath);
filename = fn_array["FILENAME"] + fn_array["EXTENSION"];

rootOn = "";
fscanf(_in_FilePath, "String", dataFileString);

baseFilePath = "spool/" + filename;

// Move inFile to alignmentData path
alignmentData = baseFilePath + ".seq";
fprintf(alignmentData, CLEAR_FILE, dataFileString);

// Write the tree splits to the tree data file
analysisSpecRaw = _getRawTreeSplits(_in_FilePath, "treeMode", "rootOn");
treeData = baseFilePath + ".trees";
fprintf(treeData, CLEAR_FILE, analysisSpecRaw);

