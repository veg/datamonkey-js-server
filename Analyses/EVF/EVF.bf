/* 

INPUT:

	1. file descriptor			: upload.numbers.1
	2. gencodeid				: >=0 for a genetic code, Universal = 0
	3. model description		: six-character string (nucleotides) 
	4. multiRate				: use a multi-rate codon model from a list of known models; if < 0, then use the default setting.
	5. treeMode					: default = 0 (NJ)
	
OUTPUT:

	1. [NEXUS] the fit			: stores the best fitting model, 
								  tree mode (in _treeMode)
								  sampled distribution (in _sampled_gbdd)
								  sampled posteriors   (in _sampled_post)
								  multiRate (in _multiRate)
		
*/

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile			("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile			("../Shared/globals.ibf");

startTimer 					= Time(1);
fscanf  					(stdin,"String",fileSpec);
fscanf						(stdin,"Number",genCodeID);
fscanf  					(stdin,"String",modelDesc);
fscanf  					(stdin,"String",multiRate);
fscanf						(stdin,"Number",treeMode);



GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec);
GetURL				(analysisSpecRaw, _getTreeLink (fileSpec,treeMode,""));

baseFilePath  		= BASE_CLUSTER_DIR + "Analyses/EVF/spool/"+fileSpec;
progressFilePath	= baseFilePath + ".progress";
_bivariateFilePath	= baseFilePath;
outputFilePath		= baseFilePath + ".out"; /* .details file */



/*
GLOBAL_FPRINTF_REDIRECT = stdoutFilePath;
*/

skipCodeSelectionStep = 1;
ExecuteAFile		("../Shared/chooseGeneticCode.def");
ApplyGeneticCodeTable ( genCodeID );
ExecuteAFile		("../Shared/_MFReader_.ibf");

multiRateOptions = {};
if (multiRate < 0)
{
	multiRateOptions["0"] = "Default";
}

AUTO_PARALLELIZE_OPTIMIZE = 2;

ExecuteAFile		("BivariateCodonRateAnalysis.bf",multiRateOptions);

AUTO_PARALLELIZE_OPTIMIZE = 0;

DeleteObject		(lf);
sampleOptions 		= {"0": lastLFSpool};
ExecuteAFile		("GeneratePosteriorSample.bf", sampleOptions);

positiveWeight = 0;
negativeWeight = 0;

for (r = 0; r < Rows(rateDistributionInfo); r = r + 1)
{
	if (rateDistributionInfo[r][0] < rateDistributionInfo[r][1])
	{
		positiveWeight = positiveWeight + rateDistributionInfo[r][3];
	}
	else
	{
		negativeWeight = negativeWeight + rateDistributionInfo[r][3];	
	}
}

fscanf (lastLFSpool, "Raw", fit);

fit = fit ^ {{"BEGIN HYPHY;", "BEGIN HYPHY;\n\n\n_sampled_posteriors = "+allPosteriors+";_sampled_gbdd = " + allSamples + ";\n\n\n_treeMode = " + treeMode + ";_multiRate = " + multiRate + ";\n"}};
fprintf (outputFilePath, CLEAR_FILE,fit,CLOSE_FILE);
fprintf 			(progressFilePath, CLEAR_FILE, "DONE");
GetString 			(HTML_OUT, TIME_STAMP, 1);
/*usage log: taxa, sites, time, number of rate classes, dN>dS weight, dN<dS weight */

fprintf  			("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",filteredData.species,",",filteredData.sites,",",Time(1)-startTimer,",",bestClassCount,",",positiveWeight,",",negativeWeight, "\n");



