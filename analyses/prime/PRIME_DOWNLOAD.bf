RequireVersion("2.11");

fscanf(stdin,"String", _in_FilePath);
fscanf(stdin,"Number", treeMode);

ExecuteAFile("../Shared/globals.ibf");
ExecuteAFile("../Shared/GrabBag.bf");

rootOn = "";
GetURL(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath);
analysisSpecRaw = _getRawTreeSplits (_in_FilePath, "treeMode", "rootOn");

baseFilePath = "spool/"+_in_FilePath;
alignmentData = baseFilePath + ".seq";
treeData = baseFilePath + ".trees";

fprintf(alignmentData, CLEAR_FILE, dataFileString);
fprintf(treeData, CLEAR_FILE, analysisSpecRaw);

