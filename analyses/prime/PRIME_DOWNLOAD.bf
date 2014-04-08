RequireVersion("2.11");

fscanf(stdin, "String", _in_FilePath);
fscanf(stdin, "Number", treeMode);
fscanf(stdin, "String", msaid);

ExecuteAFile("../../shared/globals.ibf");
ExecuteAFile("../../shared/GrabBag.bf");
ExecuteAFile("../../shared/TreeGrabBag.bf");

// Get base file name of in_FilePath
fn_array = splitFilePath(_in_FilePath);
filename = fn_array["FILENAME"] + fn_array["EXTENSION"];

rootOn = "";
fscanf(_in_FilePath, "Raw", dataFileString);

baseFilePath = "spool/" + filename;

// Move inFile to alignmentData path
alignmentData = baseFilePath + ".seq";
fprintf(alignmentData, CLEAR_FILE, dataFileString);

// Write the tree splits to the tree data file
treeData = baseFilePath + ".trees";
_getRawTreeSplits(treeData, msaid, "treeMode", "rootOn");
