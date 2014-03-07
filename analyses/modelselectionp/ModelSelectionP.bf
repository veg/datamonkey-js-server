
function timeStamp (diff)
{
	hr = diff$3600;
	mn = diff%3600$60;
	sc = diff%60$1;
	
	if (hr<10)
	{
		tstamp = "0" + hr;
	}
	else
	{
		tstamp = ""+hr;
	}
	
	if (mn<10)
	{
		tstamp = tstamp + ":0" + mn;
	}
	else
	{
		tstamp = tstamp + ":" + mn;
	}

	if (sc<10)
	{
		tstamp = tstamp + ":0" + sc;
	}
	else
	{
		tstamp = tstamp + ":" + sc;
	}

	return tstamp;
}

/* --------------------------------------------------------------------------------------------------------------------------- */

ExecuteAFile			   ("../Shared/globals.ibf");
ExecuteAFile			   ("../Shared/GrabBag.bf");
howManyDone	= 0;	
cAICFailed  = 0;

/* --------------------------------------------------------------------------------------------------------------------------- */

function ReceiveJobs (dummy)
{
	MPIReceive (-1, fromNode, result_String);


	howManyDone 		= howManyDone + 1;

	curStamp			= Time(1);
	soFar				= curStamp-timer;
	remaining			= 0;
	if (howManyDone    < totalJobs)
	{
		remaining = soFar * (totalJobs-howManyDone)/howManyDone;
	}

	jobModelNum = MPINodeState[fromNode-1][1];
	freqOption  = MPINodeState[fromNode-1][2];
	ExecuteCommands ("res=" + result_String);
	MPINodeState[fromNode-1][0] 		= 0;
	
	cModelString	= (modelList[jobModelNum])["Name"];
	
	
	if (freqOption)
	{
		cModelString = cModelString + "+F";
	}
	
	logL  = res[1][0];
	param = res[1][1] + 19*freqOption;
	TL	  = res[1][2];
	AIC	  = 2*(param-logL);
	if 	  (totalSiteCount-1 > param)
	{
		cAIC  = 2*(param*(totalSiteCount/(totalSiteCount-1-param)) - logL);
	}
	else
	{
		cAIC       = 1e100;
		cAICFailed = 1;
	}
	BIC = 2*(param*Log(totalSiteCount) - logL);
	
	
	fprintf (intermediateHTML, 	 CLEAR_FILE, "Received model ", cModelString," from node ", fromNode, " (", howManyDone, "/", totalJobs, " models done)\n",
						   "<br>Log(L)=", logL , "\tAIC = ", AIC, "\tcAIC = ", cAIC, "\tBIC = ", BIC, "<br>Tree L = ", TL, "\n",
						  "<br>Run time so far is ", timeStamp(soFar), "; projected finish in ", timeStamp(remaining), "\n");
	
	modelIndex 						  = availableModels*freqOption + jobModelNum;
	modelResultsCache [modelIndex][0] = jobModelNum;
	modelResultsCache [modelIndex][1] = freqOption;
	modelResultsCache [modelIndex][2] = logL;
	modelResultsCache [modelIndex][3] = param;
	modelResultsCache [modelIndex][4] = AIC;
	modelResultsCache [modelIndex][5] = cAIC;
	modelResultsCache [modelIndex][6] = BIC;
	modelResultsCache [modelIndex][7] = TL;
	
	return fromNode-1;
}


/* --------------------------------------------------------------------------------------------------------------------------- */


VERBOSITY_LEVEL 			= -1;
SHORT_MPI_RETURN 			= 1;


ExecuteAFile				("../Shared/ProteinModels/modellist.ibf");
availableModels				= Abs (modelList);
totalJobs					= 2*availableModels;
modelResultsCache			= {totalJobs,8}; /* matrix, freq, log L, #params, AIC, AIC-c, BIC, Tree Length;  is because of the +F option. */

fscanf  					(stdin,"String",fileSpec);

GetURL 						(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec);
/*
GetURL 						(analysisSpecRaw,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec+".splits");
*/
GetURL                          (analysisSpecRaw, _getTreeLink (fileSpec,1,0));
if (Abs (analysisSpecRaw) == 0)
{
GetURL                          (analysisSpecRaw, _getTreeLink (fileSpec,0,0));
}



baseFilePath  				= "spool/"+fileSpec;
datapath					= baseFilePath + ".data";
splitspath					= baseFilePath + ".splits";
intermediateHTML			= baseFilePath + ".progress";
finalPHP					= baseFilePath + ".out";

fprintf						(datapath, CLEAR_FILE, dataFileString);
fprintf						(splitspath, analysisSpecRaw);

ExecuteAFile				("../Shared/_MFReaderAA_.ibf");
prefix						= "Fitting " + totalJobs + " models to an alignment with " + fileCount + " partitions, "+ ds_0.species + " sequences and " + totalSiteCount + " alignment columns\n";

fprintf						(intermediateHTML, CLEAR_FILE, prefix);

timer 						= Time(1);
	 
	 
MPINodeState				= {MPI_NODE_COUNT-1,3}; /* status; model index; 0/1 for -/+ F */	 

freqOptions	= {{"Empirical","Estimated"}};

for (rep = 0; rep < availableModels; rep = rep + 1)
{
	for (freq = 0; freq < 2; freq = freq + 1)
	{
		jobDescription				= ""; jobDescription * 256;
		jobDescription				* ("datapath=\"" + datapath + "\";\nsplitspath=\"" + splitspath + "\";\nExecuteAFile (\"../Shared/_MFReaderAA_.ibf\");\ninputOverload={};"+
							   		"\ninputOverload[\"0\"]=\"ProteinModels/" + (modelList[rep])["File"] + "\";inputOverload[\"1\"] = \""+freqOptions[freq]+"\"; ExecuteAFile (\"../Shared/Custom_AA_empirical.mdl\",inputOverload);" +
							   		"populateTrees(\"aa_tree\",fileCount);\nExecuteCommands(constructLF(\"lf\",\"filteredData\",\"aa_tree\",fileCount));Optimize(res,lf); bl = BranchLength(aa_tree_1,-1); res[1][2] = (bl*(Transpose(bl)[\"1\"]))[0]; return res;");
		jobDescription				* 0;
		for (mpiNode = 0; mpiNode < MPI_NODE_COUNT - 1; mpiNode = mpiNode + 1)
		{
			if (MPINodeState[mpiNode][0] == 0)
			{
				break;
			}
		}
		
		if (mpiNode == MPI_NODE_COUNT-1)	/* everyone's busy */
		{
			mpiNode = ReceiveJobs (0);		/* master node waits and listens */
		}

		MPINodeState[mpiNode][0] = 1;
		MPINodeState[mpiNode][1] = rep;
		MPINodeState[mpiNode][2] = freq;
		MPISend (mpiNode+1, jobDescription);
	}
}
	
	
/* catch finished jobs here */
runningJobs = MPINodeState[-1][0];
runningJobs = ((Transpose(runningJobs))*runningJobs)[0];
for (rep = 0; rep < runningJobs; rep = rep + 1)
{
	ReceiveJobs (0);
}
	

fprintf						(finalPHP, CLEAR_FILE, modelResultsCache);
fprintf 					(intermediateHTML,CLEAR_FILE,"DONE");

modelResultsCache			= modelResultsCache % 4;
cModelString				= (modelList[modelResultsCache[0][0]])["Name"];

if (modelResultsCache[0][1])
{
	cModelString = cModelString + "+F";
}


GetString 					(HTML_OUT, TIME_STAMP, 1);
fprintf   					("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",ds_0.species,",",ds_0.sites,",",Time(1)-timer,",",cModelString,"\n");

