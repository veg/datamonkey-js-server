/* 

INPUT:

	file descriptor 		: upload.numbers.1
	data type				: 0 (nucleotides) or 1 (protein)
	model description		: six string (nucleotides) or a string descriptor (see Shared/ProteinModels/modellist.ibf)
	protein freq choice     : 0 (model frequencies) or 1 (+F option); for protein models only
	rvChoice				: 0 - constant rates, 1 - GDD, 2 - Beta/Gamma
	rateClasses				: for rvChoice > 1 determines how many rate classes the rate distribution should have
	
OUTPUT:
	ERROR: anyting 
		GARD run failed with the stated problem
		
	[NUMBER]: run time (seconds)
	[NUMBER]: remaining allocated time (seconds)
	[NUMBER]: total models 
	[NUMBER]: the number of breakpoints yielding the best AIC score
	[NUMBER]: number of reported breakpoint fragments
	[NUMBER]: rvChoice
	[NUMBER]: rateClasses
	[NUMBER]: number of potential breakpoints
	[STRING]: model description
	[NUMBER]: baseline cAIC score
	
	
	for each reported breakpoint
		[NUMBER]: AIC-c improvement relative to the previous model (one fewer BP)
		[MATRIX]: the placement of breakpoints (in sequence coordinates)
	[STRING]: alphabet characters
	[MATRIX]: substitution matrix (scaled to one substitution per site)
	if (rvChoice>0)
		[MATRIX] rate distribution information
		
	if (has breakpoints)
		[NUMBER]: c-AIC of the single tree model under the optimal inferred partitions
		[MATRIX]: pairwise (tree/partition) log L scores for the KH test
		[MATRIX]: pairwise (tree/partition) p-value from the KH test
		
	[REPEAT FOR EVERY PARTITION IN THE BEST FITTING MODEL]
		[STRING] partition tree
		[STRING] partition span 
		
		
	[REPEAT FOR EVERY MODEL]
		[STRING] Partiton Info (start-end[,start-end])
		[STRING] Tree lengths per partition
		[AIC] partition score
	
	
*/	

ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile			("../Shared/globals.ibf");


dataType				= 0; /* 0 for nucleotide; 1 for protein */

/* ________________________________________________________________________________________________*/

partCount				= 2;

MESSAGE_LOGGING			= 0;
produceOffspring		= MPI_NODE_COUNT-1;
populationSize  		= 2*produceOffspring;
incestDistance  		= 0;
generationCount		  	= 5000;
maxSampleTries			= populationSize*10;
mutationThreshhold		= 0.0001;
mutationProb			= 0.15;
mutationProbDecrease	= 0.95;
annealingPhase			= 100;
SHORT_MPI_RETURN		= 1;
totalSampleCounter		= 0;
localMutationRate		= 0.05;
localMutationInterval	= 20;
shortestAllowedSegment  = 0;

stoppingCriterion		= 50;
sampleCount				= 0;
familyControlSize		= produceOffspring$6;

verboseFlag				= 0;
rateClassesCount		= 2;
MESSAGE_LOGGING			= 0;
cAICPenaltyPerSite		= 100;
adjustAICScores			= 1;
maxTimeAllowed			= 1*3600;
startAtBreakpoint		= 1;

/* ________________________________________________________________________________________________*/

MasterList						= {};
TreeLengthList					= {};
REPLACE_TREE_STRUCTURE  		= 1;
bppMap							= {};
SHORT_MPI_RETURN				= 1;
totalBitSize					= 0;
LIKELIHOOD_FUNCTION_OUTPUT 		= 0;
FILE_SEPARATOR			   		= "__FILE_SEPARATOR__";


/*------------------------------------------------------------------------*/

VERBOSITY_LEVEL 		= -1;
SHORT_MPI_RETURN 		= 1;

outHTML 				= "";
outHTML 				* 65536;

finishedModels 			= 0;
modelType     			= 1;
branchLengths 			= 1;

fscanf  			(stdin,"String",fileSpec);
fscanf				(stdin,"Number",dataType);
fscanf  			(stdin,"String",modelDesc);
fscanf				(stdin,"Number",protModelFChoice);
fscanf				(stdin,"Number",rvChoice);
fscanf				(stdin,"Number",rateClasses);

if (rvChoice)
{
	rateClasses			= rateClasses$1;
	rateClasses			= Min (8, Max(2, rateClasses));
}

GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec);

global AC 	= 1;
global AT 	= 1;
global CG 	= 1;
global CT 	= 1;
global GT 	= 1;

reportModelString   = _generateModelName (dataType, modelDesc,rvChoice,"modelDescString");


ExecuteAFile 			("../Shared/NJ.bf");

baseFilePath  		= "spool/"+fileSpec;
progressFilePath	= baseFilePath + ".progress";
outputFilePath		= baseFilePath + ".out";

fprintf				(progressFilePath, CLEAR_FILE, 
									"<DIV class = 'RepClassSM'><b>GARD ANALYSIS PROGRESS</b></DIV><DIV class = 'RepClassSM'>Fitting the baseline (",modelDescString,") model.</DIV>");

fprintf	(outputFilePath,   CLEAR_FILE, KEEP_OPEN);

DataSet 	  ds 		    = ReadFromString (dataFileString);
DataSetFilter filteredData  = CreateFilter (ds,1);
fprintf				(baseFilePath, CLEAR_FILE, filteredData);

GetDataInfo					(_filterChars, filteredData, "CHARACTERS");

filterDimension				= Columns(_filterChars);

/* locate potential breakpoints */
bppMap						= _determineBreakpointPlacement();

ExecuteAFile ("../Shared/SBP_GARD_model.bf");

bppSize = (Log(Abs(bppMap))/Log(2)+1)$1;
fprintf (progressFilePath, "<DIV class = 'RepClassSM'>There are ",Abs(bppMap)," potential breakpoints. <p>Bit size of the sample is ", bppSize,".</DIV>");


h = Abs(bppMap);

if (h <= partCount)
{
	fprintf (outputFilePath,   "ERROR: \nThere are too few potential break points to support ", partCount-1, " recombination events.\n");
	fprintf (progressFilePath, CLEAR_FILE, "DONE");
	return 0;
}

maxBPP 	   = h-1;

treeString			= InferTreeTopology (0);
baseTreeString 		= treeString;
Tree baseTree 		= treeString;

branchNames	  		       = BranchName (baseTree,-1);
LikelihoodFunction lf_base = (filteredData,baseTree);

GetString				    (lfInfo, lf_base, -1);
modelNameToRestore         = (lfInfo["Models"])[0];

Optimize (res,lf_base);

base_lf_args = stashAllParameters ("lf_base");

/* check parameter counts */

GetString 				(varList, lf_base, -1);
if (dataType == 0)
{
	freqParamCount				= 3;
}
else
{
	freqParamCount				= 19;
}

baseParams 		   		= Columns(varList["Global Independent"])+freqParamCount;
perPartParameterCount	= Columns(varList["Local Independent"]);
baseSites		   		= filteredData.sites;

if (baseParams + (partCount) * perPartParameterCount >= baseSites - 1)
{
	fprintf (outputFilePath,   "ERROR: \nToo few sites for c-AIC inference.\n");
	fprintf (progressFilePath, CLEAR_FILE, "DONE");
	return 0;
}


/*Optimize 		   (res,lf_base);*/

baseLL			   = res[1][0];

currentPopulation  = {};
sortedScores	   = {populationSize,2};
/*baseParams 		   = res[1][2];*/

myDF 			   = baseParams+perPartParameterCount;

sortedScores[0][0] = 2*(res[1][0]-myDF*(baseSites/(baseSites-myDF-1)));
sortedScores[0][1] = 0;

fprintf (progressFilePath, CLEAR_FILE, "<DIV class = 'RepClassSM'>Done with single partition analysis",
				 "<p>Log(L) = ",lf_base,
				 "<p>c-AIC  = ",-sortedScores[0][0], "</DIV>");


if (baseParams>freqParamCount)
{

	ConstraintString = "";
	ConstraintString*256;
	for (h=0; h<baseParams-freqParamCount; h=h+1)
	{
		GetString (v,lf_base,h);
		ConstraintString * (v+":="+v+"__;\n");
	}
	ConstraintString*0;
	ExecuteCommands (ConstraintString);
}

_mpiPrefixString = "";
_mpiPrefixString * 256;

_mpiPrefixString * ("dataType = "+dataType+";ExecuteAFile (\""+BASE_CLUSTER_DIR+"Analyses/Shared/NJ.bf\");");
_mpiPrefixString * ("DataSet 	ds    = ReadDataFile (\""+BASE_CLUSTER_DIR+"Analyses/GARD/"+baseFilePath+"\");");
Export (modelString, USE_LAST_MODEL);
_mpiPrefixString * modelString;
_mpiPrefixString * 0;

crapAIC 		 = -sortedScores[0][0];

startTimer		 = Time (1);

if (MPI_NODE_COUNT>1)
{
	MPINodeState 			= {MPI_NODE_COUNT-1,3};
	MPINodeBreakpoints		= {};
}

currentBEST_IC 			 = crapAIC;
ibfPath 				 = BASE_CLUSTER_DIR + "Analyses/GARD/GA_CHC.ibf";
current_BPP_done_counter = 0;

lastImprovedBPC = 0;

byBPImprovement = {};
byBPSplits		= {};

DataSetFilter allData = CreateFilter (ds, 1);

byBPImprovement[0]    = crapAIC;
bestIndividualOverall = 0;


for (currentBPC = startAtBreakpoint; currentBPC < maxBPP; currentBPC = currentBPC + 1)
{
	partCount 				= currentBPC;
	totalBitSize 			= bppSize * partCount;
	stateVectorDimension 	= totalBitSize;
	
	if (currentBPC == startAtBreakpoint)
	{
		currentPopulation [0] = {totalBitSize,1};
	}
	else
	{
		for (k=0; k<populationSize; k=k+1)
		{
			oldVector 			 = currentPopulation[k];
			newVector			 = {totalBitSize,1};
			currentPopulation[k] = newVector ["oldVector[_MATRIX_ELEMENT_ROW_%(totalBitSize-bppSize)]"];
		}
		children = {};
	}	
	
	totalModelCounter 		 = 1;
	kf 						 = 1;

	for (k=1; k <= partCount; k=k+1)
	{
		totalModelCounter = totalModelCounter * (Abs(bppMap)-k+1);
		kf 				  = kf * k;
	} 
	totalModelCounter = totalModelCounter / kf;

	ExecuteAFile			 (ibfPath);	 
	
	current_BPP_done_counter = Abs (MasterList);
	kf						 = -sortedScores[populationSize-1][0];
	
	if (currentBEST_IC > kf || currentBPC == 1)
	{
		byBPSplits		[currentBPC] = ConvertToPart 	(currentPopulation[populationSize-1]);
		byBPImprovement [currentBPC] = currentBEST_IC-kf;
		if (currentBEST_IC > kf)
		{
			lastImprovedBPC       = currentBPC;
			bestIndividualOverall = currentPopulation[populationSize-1];
		}
		currentBEST_IC = Min(kf,currentBEST_IC);
	}
	else
	{
		break;
	}
}


timeSoFar = Time(1)-startTimer;

/* generate the output file */

totalBitSize = Rows (bestIndividualOverall)*Columns(bestIndividualOverall);
lastImprovedBPC    = totalBitSize/bppSize;

fprintf (outputFilePath, timeSoFar, ",", timeLeft, ",", Abs(MasterList), ",", lastImprovedBPC, ",", Abs(byBPSplits), ",", rvChoice, ",", rateClasses, ",", maxBPP, "\n", reportModelString, "\n");

fprintf (outputFilePath, byBPImprovement[0],"\n"); 

for (k = 1; k <= lastImprovedBPC; k=k+1)
{
    mappedSplits = (byBPSplits[k])["bppMap[_MATRIX_ELEMENT_VALUE_]"];
	fprintf (outputFilePath, byBPImprovement[k],"\n", mappedSplits,"\n"); 
}

restoreGlobalParameters (base_lf_args);

_reportSubstitutionMatrix ("baseTree","filteredData");

if (Rows(bestIndividualOverall))
{
	totalBitSize = Rows (bestIndividualOverall)*Columns(bestIndividualOverall);
	partCount    = totalBitSize/bppSize;
	outAVL = ExportAMatrix (bestIndividualOverall,0);
	filterStrings = outAVL["Filters"];
	treeStrings	  = outAVL["Trees"];
	
	USE_DISTANCES = 0;
	lfDef = "";
	lfDef * 128;
	lfDef  * "LikelihoodFunction multiPart  = (";
	
	readPCount = Abs (filterStrings);
	
	for (pccounter = 0; pccounter < readPCount; pccounter = pccounter + 1)
	{
		ExecuteCommands ("DataSetFilter part_" + pccounter + " = CreateFilter (ds, 1, \"" + filterStrings[pccounter] + "\");");
		ExecuteCommands ("Tree tree_" + pccounter + " = baseTreeString;");
		if (pccounter)
		{
			lfDef  * ",";
		}
		lfDef  * ("part_"+pccounter+",tree_"+pccounter);
	}
	lfDef  * ");";
	lfDef  * 0;
	ExecuteCommands (lfDef);
	
	Optimize (res2, multiPart);
	myDF  = res2[1][1]+baseParams;
	myAIC = -2*(res2[1][0]-myDF*(baseSites/(baseSites-myDF-1)));
	
	fprintf (outputFilePath, myAIC, "\n");


	bpLocations = {readPCount, 1}; 
	for (pccounter = 0; pccounter <  readPCount; pccounter = pccounter + 1)
	{
		if (pccounter)
		{
			bpLocations[pccounter] = siteCount + bpLocations[pccounter-1];
		}
		ExecuteCommands ("siteCount = part_" + pccounter + ".sites;");
	}
	
	fprintf (progressFilePath, CLEAR_FILE, "<DIV class = 'RepClassSM'>Performing KH testing on the best found partition</DIV>");

	
	conditionals 	 = {};
	likelihoodScores = {readPCount,readPCount};
	pairwiseP		 = {readPCount,readPCount};
	
	treeSplitMatches 	 = 0;
	khIterations		 = 10000;
	
	LIKELIHOOD_FUNCTION_OUTPUT = 7;
	
	for (pccounter = 0; pccounter <  readPCount; pccounter = pccounter + 1)
	{
		for (pc2 = 0; pc2 <  readPCount; pc2 = pc2 + 1)
		{
			if (Abs(pc2-pccounter) <= 1)
			{
				DataSetFilter 		aPart = CreateFilter (ds,1,filterStrings[pccounter]);
				Tree		  		aTree = treeStrings[pc2];
				LikelihoodFunction	aLF	= (aPart,aTree);
				
				Optimize			(aRes, aLF);	
				ConstructCategoryMatrix (conds, aLF,SITE_LOG_LIKELIHOODS);
				conditionals		[pccounter*readPCount+pc2] = conds;
				likelihoodScores	[pccounter][pc2] = aRes[1][0];
			}
		}
		
		partTreeConds = conditionals[pccounter*readPCount+pccounter];
		
		for (pc2 = 0; pc2 <  readPCount; pc2 = pc2 + 1)
		{
			if (Abs(pc2-pccounter) == 1)
			{
				otherPartTree = conditionals[pccounter*readPCount+pc2];
				baseLRT = 2*(likelihoodScores[pccounter][pccounter]-likelihoodScores[pccounter][pc2]);
				textMx = testLRT(partTreeConds,otherPartTree,khIterations) % 0;
				for (kk=0; kk<khIterations; kk=kk+1)
				{	
					if (textMx[kk]>=2*OPTIMIZATION_PRECISION)
					{
						break;
					}
				}
				pval = Max(1,kk)/khIterations;
				pairwiseP[pccounter][pc2] = pval;
			}
		}
	}
	
	fprintf (outputFilePath, likelihoodScores, "\n", pairwiseP, "\n");


}
else
{
	outAVL = ExportAMatrix (currentPopulation[populationSize-1],0);
	fprintf (outputFilePath, "\n", crapAIC);
}

upto = Abs (outAVL["BP"]);

for (k = 0; k < upto; k=k+1)
{
	fprintf (outputFilePath, (outAVL["Trees"])[k], "\n");
	fprintf (outputFilePath, (outAVL["BP"])[k], "\n");
}

masterKeys = Rows (MasterList);

for (h=Rows(masterKeys)*Columns(masterKeys)-1; h>=0; h=h-1)
{
	aKey = masterKeys[h];
	fprintf (outputFilePath, aKey, "\n",TreeLengthList[aKey], "\n", -MasterList[aKey], "\n");
}


fprintf (outputFilePath, CLOSE_FILE);


fprintf   (progressFilePath, CLEAR_FILE, "DONE");
GetString (HTML_OUT, TIME_STAMP, 1);
fprintf   ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",allData.species,",",allData.sites,",",Time(1)-startTimer,",",reportModelName,",",rvChoice,",",rateClasses,",",lastImprovedBPC,",",crapAIC - currentBEST_IC,"\n");



/*---------------------------------------------------------------------------------------------------------------------------------------------*/
/* GA functions */
/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function StringToMatrix (zz)
{
	return zz;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function ExportAMatrix (rateMatrix,dummy)
{
	if (Abs(rateMatrix))
	{
		sortedBP 	= ConvertToPart (rateMatrix);
	}
	else
	{
		v = 0;
	}
	
	theAVL	= {};
	
	theAVL ["BP"]         = {};
	theAVL ["Filters"]    = {};
	theAVL ["Trees"]      = {};
	
	bpF 	= -1;
	bpF2	= -1;
	
	
	USE_DISTANCES = 0;

	lfDef = "";
	lfDef * 128;
	lfDef  * "LikelihoodFunction multiPart  = (";


	partSpecs = {};
	
	ExecuteCommands ("UseModel("+modelNameToRestore+");");

	for (h=0; h<v; h=h+1)
	{
		bpF2 = sortedBP[h];
		bpF2 = bppMap[bpF2];
		filterString = ""+(bpF+1)+"-"+bpF2;		
		(theAVL ["BP"])[h]   = ""+(bpF+2)+"-"+(bpF2+1);
		(theAVL ["Filters"])[h]   = filterString;

		DataSetFilter filteredData = CreateFilter(ds,1,filterString);
		treeString=InferTreeTopology (0);

		ExecuteCommands ("DataSetFilter part_" + h + " = CreateFilter (ds, 1, \"" + filterString + "\");");
		ExecuteCommands ("Tree tree_" 		   + h + " = " + treeString + ";");
				
		if (h)
		{
			lfDef * ",";
		}
		lfDef  * ("part_"+h+",tree_"+h);
		partSpecs [h] = filterString;
		bpF = bpF2;
	}
	
	if (bpF2<ds.sites)
	{
		filterString = ""+(bpF2+1)+"-"+(ds.sites-1);
		(theAVL ["BP"])[h]   = ""+(bpF+2)+"-"+ds.sites;
		(theAVL ["Filters"])[h]   = filterString;
		DataSetFilter filteredData = CreateFilter(ds,1,filterString);
		partSpecs [h] = filterString;
		treeString				   = InferTreeTopology 		  (0);
		ExecuteCommands 			("DataSetFilter part_" + h + " = CreateFilter (ds, 1, \"" + filterString + "\");");
		ExecuteCommands 			("Tree tree_" + h + " = " + treeString + ";");
		if (h)
		{
			lfDef * ",";
		}
		lfDef  * ("part_"+h+",tree_"+h);
	}

	lfDef  * ");";
	lfDef  * 0;
	ExecuteCommands (lfDef);
	Optimize (res, multiPart);

	ConstraintString = "";
	ConstraintString * 8192;
	
	for (h=0; h<Abs (partSpecs); h=h+1)
	{
		ConstraintString * ("\n" + partSpecs [h] + "\n");
		ExecuteCommands    ("filterString = Format (tree_" + h + ",0,1);");
		ConstraintString * filterString;
		(theAVL ["Trees"]) [h]    = filterString;
	}

	ConstraintString * 0;

	return theAVL;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function CleanUpMPI (dummy)
{
	if (MPI_NODE_COUNT>1)
	{
		while (1)
		{
			for (nodeCounter = 0; nodeCounter < MPI_NODE_COUNT-1; nodeCounter = nodeCounter+1)
			{
				if (MPINodeState[nodeCounter][0]==1)
				{
					fromNode = ReceiveJobs (0,0);
					break;	
				}
			}
			if (nodeCounter == MPI_NODE_COUNT-1)
			{
				break;
			}
		}			
	}
	return 0;
}
/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function adjustAICScore (theLL,bpMatrix)
{
	daAICScore = 2*(baseParams*(baseSites/(baseSites-baseParams-1)) - theLL) ;
	lastBpos   = 0;
	
	for (_pid = 0; _pid < Rows(bpMatrix); _pid = _pid+1)
	{
		thisSpan = bppMap[bpMatrix[_pid]] - lastBpos+1;
		lastBpos = bppMap[bpMatrix[_pid]];
		if (thisSpan > perPartParameterCount + 1)
		{
			daAICScore = daAICScore + 2*(perPartParameterCount*(thisSpan/(thisSpan-perPartParameterCount-1)));
		}
		else
		{
			daAICScore = daAICScore + 2*perPartParameterCount*cAICPenaltyPerSite;
		}
	}
	
	thisSpan = baseSites-lastBpos;
	if (thisSpan > perPartParameterCount + 1)
	{
		daAICScore = daAICScore + 2*(perPartParameterCount*(thisSpan/(thisSpan-perPartParameterCount-1)));
	}
	else
	{
		daAICScore = daAICScore + 2*perPartParameterCount*cAICPenaltyPerSite;
	}
	
	return -daAICScore;
}


/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function ReceiveJobs (sendOrNot, ji)
{
	if (MPI_NODE_COUNT>1)
	{
		MPIReceive (-1, fromNode, result_String);
		mji = MPINodeState[fromNode-1][1];
		
		if (sendOrNot)
		{
			MPISend 	(fromNode,mpiStringToSend);
			MPINodeState[fromNode-1][1] = ji;			
		}
		else
		{
			MPINodeState[fromNode-1][0] = 0;
			MPINodeState[fromNode-1][1] = -1;		
		}
		ExecuteCommands ("_hyphyAssociativeArray="+result_String);
		lf_MLES    = _hyphyAssociativeArray ["MLES"];
		lf_TREES   = _hyphyAssociativeArray ["TREES"];
		
		//fprintf ("dump.raw", _hyphyAssociativeArray, "\n");
		
		myDF  = lf_MLES[1][1]+baseParams;
		myAIC = 2*(lf_MLES[1][0]-myDF*(baseSites/(baseSites-myDF-1)));
		myLL  = lf_MLES[1][0];
		ji 	  = mji;
	}
	else
	{
		myDF  = res[1][1]+baseParams;
		myAIC = 2*(res[1][0]-myDF*(baseSites/(baseSites-myDF-1)));
	}
	
	sortedBP = {{-1}};
	
	if (resultProcessingContext==0)
	{
		sortedScores[ji][0] = myAIC;
		if (ji>=0)
		{
			jobPrint = ConvertToPartString (currentPopulation[ji]);
			sortedBP = ConvertToPart 	   (currentPopulation[ji]);
			if (adjustAICScores)
			{
				myAIC	 = adjustAICScore (myLL, sortedBP);
			}
			v 		 = Rows (sortedBP);
			sortedScores[ji][0] = myAIC;
		}
		if (verboseFlag)
		{
			fprintf (stdout, "Individual ",ji," AIC-c = ",-myAIC," ");
		}
	}
	else
	{
		intermediateProbs[ji][0] = myAIC;	
		if (ji>=0)
		{
			jobPrint = ConvertToPartString (children[ji-populationSize]);
			sortedBP = ConvertToPart 	   (children[ji-populationSize]);
			if (adjustAICScores)
			{
				myAIC	 = adjustAICScore (myLL, sortedBP);
			}
			v = Rows (sortedBP);
			intermediateProbs[ji][0] = myAIC;	
		}
		if (verboseFlag)
		{
			fprintf (stdout, "Offspring ",ji," AIC-c = ",-myAIC," ");
		}
	}
	
	if (sortedBP[0]>=0)
	{
		bpF = -1;
		
		filterString = "";
		for (h=0; h<v; h=h+1)
		{
			bpF2 = sortedBP[h];
			bpF2 = bppMap[bpF2];
			filterString = filterString+" "+(bpF+1)+"-"+bpF2;			
			bpF = bpF2;
		}
		
		if (bpF2<ds.sites)
		{
			filterString = filterString+" "+(bpF2+1)+"-"+(ds.sites-1);			
		}

		if (verboseFlag)
		{
			fprintf (stdout, " ", filterString, "\n");
		}

		MasterList 	   [jobPrint] = myAIC;
		treeLengths	   = ""+ComputeTreeLength(lf_TREES[0]);
		for (k=1; k<Abs(lf_TREES); k=k+1)
		{
			treeLengths	   = treeLengths + "," + ComputeTreeLength(lf_TREES[k]);
		}
		TreeLengthList [jobPrint] = treeLengths;
		
	}
	return fromNode-1;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

compressedString = {{1,1}};

function MakeStringCanonical (someString, dummy)
{
	return someString;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function ConvertToPartString (pString)
{
	sortedBP = ConvertToPart (pString);
	bpF = -1;
	
	
	minPartLength 	  = 1e100;
	
	_ConstraintString = "";
	_ConstraintString * 256;
	

	for (h=0; h<v; h=h+1)
	{
		bpF2 = bppMap[sortedBP[h]];
	
		if (h)
		{
			_ConstraintString * ",";
		}
		_ConstraintString * (""+(bpF+1)+"-"+bpF2);		
		curSegLength = bpF2-bpF;

		bpF = bpF2;
		
		if (curSegLength < minPartLength && curSegLength>0)
		{
			minPartLength = curSegLength;
		}
	}
	
	if (bpF2<ds.sites)
	{
		_ConstraintString * (","+(bpF2+1)+"-"+(ds.sites-1));		
		curSegLength = ds.sites-bpF2;
		
		if (curSegLength < minPartLength && curSegLength>0)
		{
			minPartLength = curSegLength;
		}
	}

	_ConstraintString * 0;
	return _ConstraintString;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function ConvertToPart (pString)
{
	partitionHits    = 		{};
	h 				 = 		0; 
	v 				 = 		bppSize;
	
	for (mpiNode=0; mpiNode<partCount; mpiNode=mpiNode+1)
	{
		aBP    = 0;
		bpF	   = 2^(bppSize-1);
		
		for (; h<v; h=h+1)
		{
			aBP = aBP + bpF*(0+pString[h]);
			bpF = bpF/2;
		}
		
		if (aBP>=Abs(bppMap)-1)
		{
			aBP = aBP - 2^(bppSize-1);
		}
		
		v = v + bppSize;
		partitionHits[aBP] = 1;
	}

	meKeys	 = Rows(partitionHits);
	v 		 = Columns(meKeys);
	sortedBP = {v,1};
	
	for (h=0; h<v; h=h+1)
	{
		sortedBP [h] = 0+meKeys[h];
	}
	
	sortedBP = sortedBP % 0;
	return 	   sortedBP;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function RunASample (dummy,jobIndex)
{	
	myAIC	 = MasterList[ConvertToPartString (cString)];

	if (myAIC<0)
	{		
		if (resultProcessingContext==0)
		{
			sortedScores[jobIndex][0] = myAIC;
			if (verboseFlag)
			{
				fprintf (stdout, "Individual ",jobIndex," AIC-c = ",-myAIC, "\n");
			}
		}
		else
		{
			intermediateProbs[jobIndex][0] = myAIC;	
			if (verboseFlag)
			{
				fprintf (stdout, "Offspring ",jobIndex," AIC-c = ",-myAIC,"\n");
			}
		}	
		return 0;
	}

	bpF = -1;
	
	
	mpiStringToSend 			 = "";
	mpiStringToSend				* 8192;
	
	ConstraintString			 = "";
	LikelihoodFunctionString 	 = "";
	ConstraintString 			* 8192;
	LikelihoodFunctionString 	* 256;
	LikelihoodFunctionString	* "LikelihoodFunction lf=(";
	

	for (h=0; h<v; h=h+1)
	{
		bpF2 = bppMap[sortedBP[h]];
		filterString = ""+(bpF+1)+"-"+bpF2;		
		
		ConstraintString * ("DataSetFilter filteredData = CreateFilter(ds,1,\""+filterString+"\");");
		
		ConstraintString * ("DataSetFilter filteredData"+h+" = CreateFilter (ds,1,\""+filterString+"\");");
		
		ConstraintString * ("treeString=InferTreeTopology (0);Tree givenTree"+h+" = treeString;");
		if (h)
		{
			LikelihoodFunctionString * ",";
		}
		LikelihoodFunctionString * ("filteredData" + h + ",givenTree"+h);
		bpF = bpF2;
	}
	
	if ((bpF2<ds.sites && (dataType == 0)) || (bpF2<3*ds.sites && dataType))
	{
		filterString = ""+(bpF2+1)+"-"+(ds.sites-1);		
		

		ConstraintString * ("DataSetFilter filteredData = CreateFilter(ds,1,\""+filterString+"\");");
		ConstraintString * ("DataSetFilter filteredData"+h+" = CreateFilter (ds,1,\""+filterString+"\");");
		
		ConstraintString * ("treeString=InferTreeTopology (0);Tree givenTree"+h+" = treeString;");

		LikelihoodFunctionString * (",filteredData" + h + ",givenTree"+h);
	}


	LikelihoodFunctionString * (");");
	ConstraintString 		 * 0;
	LikelihoodFunctionString * 0;	
	
	mpiStringToSend * _mpiPrefixString;
	mpiStringToSend * ConstraintString;
	mpiStringToSend * LikelihoodFunctionString;
	
	
	if (MPI_NODE_COUNT>1 && jobIndex>=0)
	{
		mpiStringToSend * ("partCount="+(v+1)+";Optimize(res,lf);resultAVL={};resultAVL[\"MLES\"]=res;resultAVL[\"TREES\"]={};" +
						   "for(k=0; k<partCount;k=k+1){ExecuteCommands(\"ts=Format(givenTree\"+k+\",1,1);\");(resultAVL[\"TREES\"])[k]=ts;}\n" +
						   "return resultAVL;");
		mpiStringToSend * 0;
		for (mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode+1)
		{
			if (MPINodeState[mpiNode][0]==0)
			{
				break;	
			}
		}
		if (mpiNode==MPI_NODE_COUNT-1)
		{
			mpiNode = ReceiveJobs (1,jobIndex);
		}
		else
		{
			MPISend (mpiNode+1,mpiStringToSend);
			MPINodeState[mpiNode][0] = 1;
			MPINodeState[mpiNode][1] = jobIndex;
		}
		//fileOut	= "/home/datamonkey/dump/"+mpiNode+".last";
		//fprintf	(fileOut, CLEAR_FILE, mpiStringToSend);

	}
	
	return 0;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function ComputeTreeLength (tStr)
{
	UseModel (USE_NO_MODEL);
	Tree _tree = tStr;
	_treeL = BranchLength (_tree,-1);
	return (_treeL*((Transpose(_treeL))["1"]))[0];
}


/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function SpawnRandomString (clsCnt)
{
	rModel = {totalBitSize,1};
	for (h=0; h<totalBitSize; h=h+1)
	{
		rModel[h] = Random(0,2)$1;
	}
	return rModel;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function IsChildViable (putativeChild)
{
	sampleString = 	ConvertToPartString (putativeChild);
	myAIC		 = MasterList[sampleString];
	testChild 	 = putativeChild;
	mutPassCount = 1;
	
	for (_lc = 0; _lc < populationSize && myAIC > (-0.1); _lc = _lc + 1)
	{
		if (Rows (currentPopulation[_lc]))
		{
			myAIC = -(sampleString == ConvertToPartString (currentPopulation[_lc]));
		}
	} 
	for (_lc = 0; _lc < Abs(children) && myAIC > (-0.1); _lc = _lc + 1)
	{
		if (Rows (children[_lc]))
		{
			myAIC = -(sampleString == ConvertToPartString (children[_lc]));
		}
	} 
	
	while ((myAIC<(-0.1) || minPartLength<shortestAllowedSegment)&& mutPassCount < 25)
	{
		if (verboseFlag > 1)
		{
			fprintf (stdout,"Adjusting the child to avoid a duplicate. Min(fragment) = ",minPartLength,".  Pass ", mutPassCount, "\n");
		}
		
		mutPassCount 	= mutPassCount + 1;
		sampleString 	= Min(Random(0,stateVectorDimension)$1,stateVectorDimension-1);
		myAIC 			= testChild[sampleString];
		newValue 		= Random (0,rateClassesCount-0.0000001)$1;
		
		while (newValue == myAIC)
		{
			newValue 	= Random (0,rateClassesCount-0.0000001)$1;
		}
		
		testChild [sampleString]	 = newValue;
		sampleString 				 = ConvertToPartString (testChild);
		myAIC 						 = MasterList		   [sampleString];
		for (_lc = 0; _lc < populationSize && myAIC > (-0.1); _lc = _lc + 1)
		{
			if (Rows (currentPopulation[_lc]))
			{
				myAIC = -(sampleString == ConvertToPartString (currentPopulation[_lc]));
			}
		} 
		for (_lc = 0; _lc < Abs(children) && myAIC > (-0.1); _lc = _lc + 1)
		{
			if (Rows (children[_lc]))
			{
				myAIC = -(sampleString == ConvertToPartString (children[_lc]));
			}
		} 
	}
	return testChild;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function UpdateBL (dummy)
{
	return 0;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function	reportImprovementHTML (_IC)
{
	if (lastImprovedBPC)
	{
		return "<DIV class = 'RepClassSM'><b>GARD found evidence of "+lastImprovedBPC+" breakpoints</b><p>"+spoolAICTable(0)+
									 "<p><a href = 'http://www.hyphy.org/cgi-bin/GARD/GARDplot.pl?fileName=" + fileSpec + "&format=pdf'> [PDF Chart]</a>" + 
									 "<a href = 'http://www.hyphy.org/cgi-bin/GARD/GARDplot.pl?fileName=" + fileSpec + "&format=png'> [PNG Chart]</a>" + 
									 "<a href = 'http://www.hyphy.org/cgi-bin/GARD/GARDplot.pl?fileName=" + fileSpec + "&format=csv'> [CSV]</a>" + 
									 "<a href = 'http://www.hyphy.org/cgi-bin/GARD/GARDplot.pl?fileName=" + fileSpec + "&format=split'> [Best Split]</a>" + 
									 "<a href = '" + fileSpec + "_gard.splits'> [Raw]</a>"+
									 "<a href = '" + fileSpec + "_gard.nex'> [NEXUS]</a>"+
									 "<a href = 'http://www.hyphy.org/cgi-bin/Datamonkey2007/gard2datamonkey.pl?fileName="+fileSpec+"'><b>[Submit to Datamonkey.org]</b></a></DIV>";
								
	}
	return "<DIV class = 'RepClassSM'>GARD found no evidence of recombination</DIV>";
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function	outputSpan (_offset, _text)
{
	return "<span style = 'position: absolute; left: " + (140+_offset) + "px'>" + _text + "</span>";
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function 	spoolAICTable (dummy)
{
	colorList 	= {{"red","black","blue","green","purple","orange"}};
	fcolorList 	= {{"white","white","white","white","white","black"}};

	htmlAICTable = "";
	htmlAICTable * 128;


	htmlAICTable * "<html><body><div style = 'width: 580px; border: black solid 1px; '>";
	htmlAICTable * "<table style = 'width: 100%;font-size: 10px;text-align:left;'><tr><th>BPs</th><th>c-AIC</th><th>&Delta; c-AIC</th><th width = '70%'>Segments</th></tr>";


	currentAIC = byBPImprovement [0];

	for (_partCount = 0; _partCount <Abs (byBPImprovement); _partCount = _partCount + 1)
	{
		if (_partCount)
		{
			currentAIC = currentAIC - byBPImprovement [_partCount];
			ci 		   = byBPImprovement [_partCount];
			bpLocs2    = byBPSplits		 [_partCount];
			pxPerSpan  = 406/allData.sites;
			sp		   = "<table style = 'padding: 0px; spacing: 0px;'><tr>";
			
			prv 	   = Rows (bpLocs2);
			bpLocs	   = {1,prv+1};
			for (k = 0; k < prv; k=k+1)
			{
				bpLocs[k]	 = bppMap[bpLocs2[k]];
			}
			
			bpLocs[prv]  = allData.sites-1;
			prv 	     = 1;
			
			for (k=0; k<Columns (bpLocs); k=k+1)
			{
				sp = sp + "<td style = 'width:"+
					 pxPerSpan*(bpLocs[k]-prv+1)$1+
					 "px; background-color: "+
					 colorList[k%Columns(colorList)]+
					 "; color: "+
					 fcolorList[k%Columns(colorList)]+
					 "; text-align: right; font-size: 10px;'>";
					 
				if (k<Columns (bpLocs)-1)
				{
					sp = sp + (bpLocs[k] + 1);	
				}
				else
				{
					sp = sp + "&nbsp";	
				}
				sp = sp + "</td>";
				prv = bpLocs[k];
			}	
			sp = sp + "</tr></table>";
		}
		else
		{
			ci 		   = "";
			sp		   = "<table><tr><td style = 'font-size:10px;width: 406px;background-color:"+colorList[0]+"; color:"+fcolorList[0]+"'>1-"+allData.sites+"</td></tr></table>";
		}
		htmlAICTable * ("\n<tr><td>"+ _partCount+ 
							  "</td><td><div style = 'width: "+100*currentAIC/byBPImprovement [0]$1+"%; background-color: purple; color: white;'>"+currentAIC+ 
							  "</div></td><td>"+ ci+ 
							  "</td><td>"+ sp+
							  "</td></tr>");
		
	}

	htmlAICTable * "\n</table></div></body></html>";
	htmlAICTable * 0;
	return htmlAICTable;
}

/*--------------------------------------------------------------------------------------*/

function testLRT (vec1, vec2, itCount)
{
	size1 = Columns(vec1);
	
	sumVec1 = {size1,1};
	jvec	= {2,size1};
	resMx1	= {itCount,1};
	resMx2	= {itCount,1};
	
	for (k=0; k<size1; k=k+1)
	{
		sumVec1 [k]	   = 1;
		jvec	[0][k] = vec1[k];
		jvec	[1][k] = vec2[k];
	}
	
	
	for (k=0; k<itCount; k=k+1)
	{
		resampled = Random(jvec,1);
		resampled = resampled*sumVec1;
		resMx1[k] = resampled[0];
		resMx2[k] = resampled[1];
	}
	
	return (resMx1-resMx2)*2;
}
