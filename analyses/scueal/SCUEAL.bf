/* 

INPUT:

	file descriptor 		: upload.numbers.1
	data type				: 0 (nucleotides) or 1 (protein)
	model description		: six string (nucleotides) or a string descriptor (see Shared/ProteinModels/modellist.ibf)
	protein freq choice     : 0 (model frequencies) or 1 (+F option); for protein models only
	rvChoice				: 0 - constant rates, 1 - GDD, 2 - Beta/Gamma
	rateClasses				: for rvChoice > 1 determines how many rate classes the rate distribution should have
	
OUTPUT:
	
	
*/	

ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("Configs/settings.ibf");


available_references 	 = {};
available_references [0] = "pol.nex";

min_alignment_scores     = {};
min_alignment_scores [0] = 1000;

min_alignment_scores2     = {};
min_alignment_scores2 [0] = 3;

fscanf  			(stdin,"String",fileSpec);
fscanf				(stdin,"Number",reference);

if (Abs(available_references[reference]) == 0)
{
	reference = 0;
}

referenceAlignmentFileName = available_references[reference];
_minAlignmentScore		   = min_alignment_scores[reference];
_minAlignmentScore2		   = min_alignment_scores2[reference];

GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec);


startTimer			= Time(1);
baseFilePath  		= BASE_CLUSTER_DIR+"Analyses/SCUEAL/spool/"+fileSpec;
detailedResults     = baseFilePath + "/";
progressFilePath	= baseFilePath + ".progress";
outputFilePath		= baseFilePath + ".out";

fprintf				(progressFilePath, CLEAR_FILE);
fprintf				(outputFilePath, CLEAR_FILE,KEEP_OPEN);
ExecuteAFile		("TopLevel/MPIScreenFASTA.bf");

fprintf   			(outputFilePath, CLOSE_FILE);
fprintf   			(progressFilePath, CLEAR_FILE, "DONE");
GetString 			(HTML_OUT, TIME_STAMP, 1);
fprintf   			("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],"|",jobsFinished,"|",jobsFailed,"|",available_references[reference],KEEP_OPEN);
subtypeKeys 		= Rows(_stratBySubtype);

for (k = 0; k < Abs(_stratBySubtype); k=k+1)
{
	fprintf ("usage.log","|",subtypeKeys[k], ":", _stratBySubtype[subtypeKeys[k]]);
}
fprintf   			("usage.log", "\n", CLOSE_FILE);


