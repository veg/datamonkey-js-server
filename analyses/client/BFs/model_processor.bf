RequireVersion  ("0.9920060815");

fscanf	(stdin, "String", filePrefix);
fscanf	(stdin, "Number", kind);

debugMode = 0;
	
suffix = {};
suffix [0]  = "model";
suffix [1]  = "fel";
suffix [2]  = "ifel";
suffix [3]  = "rel";
suffix [4]  = "parris";
suffix [5]  = "gabranch";
suffix [6]  = "bgm";
suffix [7]  = "bgm";
suffix [8]  = "bsr";
suffix [11] = "pmodel";
suffix [12] = "meme";
suffix [13] = "fubar";
suffix [20] = "sbp";
suffix [21] = "gard";
suffix [22] = "asr";
suffix [42] = "evf";
suffix [50] = "scueal";
suffix [55] = "cms";
suffix [60] = "deps";
suffix [61] = "fade";
suffix [69] = "toggle";
suffix [71] = "prime";
suffix [99] = "uds";

header = {};
header [0] = "Model selection results";
header [1] = "FEL selection analysis results";
header [2] = "IFEL selection analysis results";
header [3] = "REL selection analysis results";
header [4] = "PARRIS selection analysis results";
header [5] = "GA-branch selection analysis results";
header [6] = "Spidermonkey/BGM co-evolutionary analysis results";
header [7] = "Spidermonkey/BGM co-evolutionary analysis (with ancestor sampling) results";
header [8] = "Branch-site REL episodic selection analysis";
header [11] = "Protein model selection results";
header [12] = "Mixed Effects Model of Episodic Selection";
header [13] = "Fast Unbiased Bayesian AppRoximation";
header [20] = "Single Breakpoint Recombination Analysis";
header [21] = "GARD Recombination Analysis";
header [22] = "Ancestral Sequence Reconstruction Analysis";
header [42] = "Evolutionary Fingerprinting Analysis";
header [50] = "Subtype Classification Using Evolutionary Algorithms";
header [55] = "Codon Model Selection Using Genetic Algorithms";
header [60] = "Directional Evolution in Protein Sequences";
header [61] = "FUBAR Approach to Directional Evolution";
header [69] = "Toggling selection";
header [71] = "PRoperty Informed Models of Evolution";
header [99] = "Ultradeep Sequence Analysis";

ExecuteAFile("../Shared/HyPhyGlobals.ibf");
ExecuteAFile("../Shared/DBTools.ibf");
ExecuteAFile("../Shared/GrabBag.bf");
ExecuteAFile("../Shared/ReadDelimitedFiles.bf");

/*raw is a copy of the main *.out from the analysis subdirectory on monkeysupreme*/
rawOut		 = BASE_OUTPUT_PATH + filePrefix +"_"+suffix[kind]+".raw";

if (!rawOut)
{
	//phpHead = phpHead ^ {{"_REPLACE_DOCUMENT_TITLE",header[kind]}};

	if ( kind != 22 ) 
	{
		fscanf					  (rawOut,"Raw", rawIn);
	}
	
	slacDBID = _openCacheDB   (filePrefix);

	if (kind == 0)
	{
		SLAC_ModelTable 			= {};
		SLAC_ModelTable 			["Model"] = "STRING";
		_CheckDBID 					(slacDBID,"SLAC_MODEL",SLAC_ModelTable);
		record 						= {};
		record 						["Model"] = rawIn[0][5];
		_InsertRecord 				(slacDBID,"SLAC_MODEL", record);
		fprintf 					(stdout,"<H1 CLASS = 'SuccessCap' style = 'text-transform:none'>", header[kind]," results</H1>",_makeJobIDHTML (filePrefix), rawIn[6][Abs(rawIn)-1]);
	}
	if (kind == 1)
	{
		ExecuteAFile ("FEL_Processor.ibf");
	}
	if (kind == 2)
	{	
		ExecuteAFile ("IFEL_Processor.ibf");
	}
	if (kind == 3)
	{	
		ExecuteAFile ("REL_Processor.ibf");
	}
	if (kind == 4)
	{	
		ExecuteAFile ("PARRIS_Processor.ibf");
	}
	if (kind == 5)
	{	
		ExecuteAFile ("GABranch_Processor.ibf");
	}
	if (kind == 6 || kind == 7)
	{	
		haveAncestralSamples = kind-6;
		ExecuteAFile ("BGM_Processor.ibf");
	}
	if (kind ==8)
	{	
		ExecuteAFile ("BSR_Processor.ibf");
	}	
	if (kind ==11)
	{	
		ExecuteAFile ("PModel_Processor.ibf");
	}
	if (kind ==12)
	{	
		ExecuteAFile ("MEME_Processor.ibf");
	}
	if (kind ==13)
	{	
		ExecuteAFile ("FUBAR_Processor.ibf");
	}
	if (kind ==20)
	{	
		ExecuteAFile ("SBP_Processor.ibf");
	}
	if (kind ==21)
	{	
		ExecuteAFile ("GARD_Processor.ibf");
	}
	if (kind ==22)
	{	
		ExecuteAFile ("ASR_Processor.ibf");
	}
	if (kind ==42)
	{	
		ExecuteAFile ("EVF_Processor.ibf");
	}	
	if (kind ==50)
	{	
		ExecuteAFile ("SCUEAL_Processor.ibf");
	}
	if (kind == 55)
	{
		ExecuteAFile ("CMS_Processor.ibf");
	}
	if ( kind == 60 ) 
	{
		ExecuteAFile("DEPS_Processor.ibf");
	}
	if (kind == 61)
	{
		ExecuteAFile("FADE_Processor.ibf");
	}
	if (kind == 69)
	{
		ExecuteAFile("Toggle_Processor.ibf");
	}
	if (kind == 71)
	{
		ExecuteAFile("PRIME_Processor.ibf");
	}
	if ( kind == 99 ) 
	{
		ExecuteAFile("UDS_Processor.ibf");
	}

    if (kind != 71 && kind != 61) {
	    fprintf (stdout, _makeTimeStampHTML (0));
	}

	_closeCacheDB 				(slacDBID);

}
else
{
	fprintf (stdout, "ERROR:Could not load results file");
}

