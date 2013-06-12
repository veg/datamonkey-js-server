RequireVersion  ("2.13");

fscanf  			(stdin,"String", _in_FilePath);
fscanf  			(stdin,"Number", _in_TreeMode);
fscanf              (stdin,"String", _in_RootOn);

ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");

rootOn = "";
GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath);
analysisSpecRaw     = _getRawTreeSplits (_in_FilePath, "_in_TreeMode", "_in_RootOn");


baseFilePath  		= "spool/"+_in_FilePath;
alignmentData   	= baseFilePath + ".seq";
treeData            = baseFilePath + ".trees";

fprintf (alignmentData, CLEAR_FILE, dataFileString);
fprintf (treeData,     CLEAR_FILE, analysisSpecRaw);

