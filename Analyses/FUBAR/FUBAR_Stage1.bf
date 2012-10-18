timer = Time(1);

RequireVersion  ("2.11");

fscanf  			(stdin,"String", _in_FilePath);

timer               = Time(1);

ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");

baseFilePath  		= "spool/"+_in_FilePath;

intermediateHTML	= baseFilePath + ".progress";
timeStamp           = baseFilePath + ".time";
alignmentData   	= baseFilePath + ".seq";
treeData            = baseFilePath + ".trees";

fscanf (alignmentData, "Raw", dataFileString);
fscanf (treeData, "Raw", analysisSpecRaw);



fprintf (timeStamp, CLEAR_FILE, timer);

ExecuteAFile			("../Shared/_MFReader_.ibf");

fprintf				(intermediateHTML, CLEAR_FILE, "<DIV class = 'RepClassSM'><b>[PHASE 1]</b> Fitting the nucleotide model to estimate relative branch lengths 
                                        and GTR substitution biases</DIV>");

vectorOfFrequencies = overallFrequencies;

SKIP_HARVEST_FREQ = 1;
LoadFunctionLibrary ("GRM", {"00":"Global"});

populateTrees ("nuc_tree", fileCount);

ExecuteCommands(constructLF ("nucLF", "nucData", "nuc_tree", fileCount));
Optimize (nuc_res, nucLF);

fprintf (intermediateHTML, "\n<DIV class = 'RepClassSM'><b>[PHASE 1 DONE]</b> LogL = ", nuc_res[1][0], "</DIV>");

LF_NEXUS_EXPORT_EXTRA      = "\n\npositionalFrequencies = " + positionFrequencies + ";";
LIKELIHOOD_FUNCTION_OUTPUT = 7;

nucFitFile = baseFilePath + ".nucFit";

fprintf (nucFitFile, CLEAR_FILE, nucLF);
