ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile			("../Shared/globals.ibf");


partCount				= 2;
khOption				= 0;
dataType				= 0; /* 0 for nucleotide; 1 for protein */

bestScores				= {3,2};
canUseAICc				= 1;

/* ________________________________________________________________________________________________*/

REPLACE_TREE_STRUCTURE  = 1;
bppMap					= {};
tree1AVL				= {};
tree2AVL				= {};
SHORT_MPI_RETURN		= 1;
VERBOSITY_LEVEL			= -1;

/* ________________________________________________________________________________________________*/

LIKELIHOOD_FUNCTION_OUTPUT = 0;
finishedSites			   = 0;
timer 					   = Time(1);
allocatedTime			   = 900;



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

reportModelString   = _generateModelName (dataType, modelDesc,rvChoice,"modelDescString");



ExecuteAFile 					("../Shared/NJ.bf");

baseFilePath  		= "spool/"+fileSpec;
progressFilePath	= baseFilePath + ".progress";
outputFilePath		= baseFilePath + ".out";

fprintf				(progressFilePath, CLEAR_FILE, 
									"<DIV class = 'RepClassSM'><b>SINGLE BREAKPOINT ANALYSIS PROGRESS</b></DIV><DIV class = 'RepClassSM'>Fitting the baseline (",modelDescString,") model.</DIV>");

fprintf	(outputFilePath,   CLEAR_FILE, KEEP_OPEN);

DataSet 	  ds 		    = ReadFromString (dataFileString);
DataSetFilter filteredData  = CreateFilter (ds,1);

GetDataInfo					(_filterChars, filteredData, "CHARACTERS");
filterDimension				= Columns(_filterChars);
bppMap						= _determineBreakpointPlacement();

ExecuteAFile 				("../Shared/SBP_GARD_model.bf");

/*------------------------------------------------------------------------*/
/* BASE FIT */
/*------------------------------------------------------------------------*/

treeString			= InferTreeTopology (0);
baseTreeString 		= treeString;
Tree givenTree 		= treeString;

branchNames	  		  = BranchName (givenTree,-1);
LikelihoodFunction lf = (filteredData,givenTree);

Optimize (res,lf);

currentPopulation  	  = {};

LIKELIHOOD_FUNCTION_OUTPUT = 7;

baseSites  = filteredData.sites;
baseLL	   = res[1][0];
baseParams = res[1][2] + (filterDimension-1)*(protModelFChoice==0); /* for frequencies */

myDF	 = res[1][1];
nullAIC  = -2*(res[1][0]-myDF);
if (baseSites-myDF-1 > 0)
{
	nullAICc   = -2*(res[1][0]-myDF*(baseSites/(baseSites-myDF-1)));
}
else
{
	canUseAICc = 0;
}
nullBIC	 = -2*(res[1][0]-0.5*myDF*Log(baseSites));

MasterList    = {Abs(bppMap),4};
MatrixList1   = {};
MatrixList2   = {};
ResamplesDone = {};

MasterList [0][0] = -1;
MasterList [0][1] = nullAIC;
MasterList [0][3] = nullBIC;

if (canUseAICc)
{
	fprintf (progressFilePath,"<DIV class = 'RepClassSM'>Done with single partition analysis<dl><dt>",
					 "Log(L)</dt><dd>",res[1][0],
					 "</dd><dt>AIC</dt><dd>",nullAIC,
					 "</dd><dt>c-AIC</dt><dd>",nullAICc,
					 "</dd><dt>BIC</dt><dd>",nullBIC, "</dd></dt></dl>\n");
					 
	MasterList [0][2] = nullAICc;
}
else
{
	fprintf (progressFilePath,"<DIV class = 'RepClassSM'>Done with single partition analysis<dl><dt>",
					 "Log(L)</dt><dd>",res[1][0],
					 "</dd><dt>AIC</dt><dd>",nullAIC,
					 "</dd><dt>c-AIC</dt><dd> too few sites to use this IC",
					 "</dd><dt>BIC</dt><dd>",nullBIC, "</dd></dt></dl>\n");
}

fprintf 	(progressFilePath, "</DIV>\n");
fprintf		(outputFilePath,modelDescString,"\n",res[1][0],"\t",myDF,"\t",canUseAICc,"\t",nullAIC,"\t",nullAICc,"\t",nullBIC,"\t",Format(givenTree,1,1),"\n");
baseParams = fixGlobalParameters ("lf");

/*
fprintf("lf.dump",CLEAR_FILE, lf);
*/

if (MPI_NODE_COUNT>1)
{
	MPINodeState = {MPI_NODE_COUNT-1,3};
}

startTimer   = Time(1);
stepping     = 1;
totalBPCount = Abs(bppMap);


doneChecking = 0;

for (individual=1; individual<totalBPCount; individual=individual+stepping)
{	
	timeSoFar = Time(1)-startTimer;
	leftToDo  = totalBPCount-individual-1;
	if (finishedSites >= MPI_NODE_COUNT-1 && doneChecking == 0)
	{
		projectedFinish = timeSoFar (1 + 1/finishedSites * leftToDo/stepping);
		suggested = (timeSoFar*leftToDo/(finishedSites*(allocatedTime-timeSoFar)) + 0.5)$1;
		
		if (suggested <= 0.0)
		{
			suggested = leftToDo$(MPI_NODE_COUNT-1);
			doneChecking = 1;
		}
		
		/*
		fprintf ("steps.out", individual, ":", allocatedTime, ":", projectedFinish, ":", timeSoFar, ":", leftToDo, ":", finishedSites, ":", suggested, "\n");
		*/
		
		if (projectedFinish > allocatedTime)
		{
			stepping = Max(1,suggested);
		}
		else
		{
			if (stepping > 1)
			{
				stepping = Max(1,suggested);		
			}
		}
	}
	RunASample 		(individual);
}

CleanUpMPI (0);

timeSoFar = Time(1)-startTimer;

fprintf	(progressFilePath, CLEAR_FILE, "DONE");
fprintf	(outputFilePath,   finishedSites, "\t", Abs(bppMap), "\t", timeSoFar, CLOSE_FILE);
GetString (HTML_OUT, TIME_STAMP, 1);
fprintf   ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",filteredData.species,",",filteredData.sites,",",Time(1)-timer,",",reportModelString,",",rvChoice,",",rateClasses,",",bestScores[0][0],",",bestScores[1][0],",",bestScores[2][0],"\n");


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
					fromNode = ReceiveJobs (0,0,0);
					break;	
				}
			}
			if (nodeCounter == MPI_NODE_COUNT-1)
			{
				break;
			}
		}			
		if (khOption)
		{
			for (bpi=0; bpi<Abs(bppMap); bpi=bpi+1)
			{
				bpv = bppMap[bpi];
				if (ResamplesDone[bpv] == 0)
				{
					if (Abs (MatrixList1[bpi]) && Abs (MatrixList2[bpi]))
					{
						runKHResampler (bpi);
					}
				}
			}		
		}
	}
	return 0;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function ReceiveJobs (sendOrNot, ji, jobKind)
{
	if (MPI_NODE_COUNT>1)
	{
		MPIReceive (-1, fromNode, result_String);
		mji = MPINodeState[fromNode-1][1];
		mjk = MPINodeState[fromNode-1][2];
		
		if (sendOrNot)
		{
			if (jobKind < 2)
			{
				MPISend (fromNode,lf);
			}
			else
			{
				MPISend (fromNode,lf2);
			}
			MPINodeState[fromNode-1][1] = ji;			
			MPINodeState[fromNode-1][2] = jobKind;			
		}
		else
		{
			MPINodeState[fromNode-1][0] = 0;
			MPINodeState[fromNode-1][1] = -1;		
			MPINodeState[fromNode-1][2] = 0;		
		}
		
		ExecuteCommands (result_String);
		ji = mji;
		jobKind = mjk; 
		if (jobKind < 2)
		{
			myDF 	= lf_MLES[1][1]+baseParams;
		
			if (canUseAICc)
			{
				myAICc  = -2*(lf_MLES[1][0]-myDF*(baseSites/(baseSites-myDF-1)));
			}
			else
			{
				myAICc  = 0;
			}
			myAIC   = -2*(lf_MLES[1][0]-myDF);
			myBIC	= -2*(lf_MLES[1][0]-0.5*myDF*Log(baseSites));
		}
	}
	else
	{
		if (jobKind < 2)
		{
			myDF 	= res[1][1]+baseParams;
			myAICc  = -2*(res[1][0]-myDF*(baseSites/(baseSites-myDF-1)));
			myAIC   = -2*(res[1][0]-myDF);
			myBIC	= -2*(res[1][0]-myDF*0.5*Log(baseSites));
		}
	}
	
	
	if (jobKind == 2)
	{
		ConstructCategoryMatrix (siteLikelihoods, lf2, COMPLETE);		
		MatrixList2 [ji] = siteLikelihoods;
	}
	else
	{
	
		finishedSites = finishedSites + 1;
		
		dAIC  = nullAIC-myAIC;
		dAICc = nullAICc-myAICc;
		dBIC  = nullBIC-myBIC;
		tsf	  = Time (1) - timer;
		
		if (stepping>1)
		{
			steppingStr = "Adjusting stride to " + stepping + " because of computing time restrictions.\n";
		}
		else
		{
			steppingStr = "";
		}
				
		fprintf (progressFilePath, CLEAR_FILE, "<DIV class = 'RepClassSM'>Processed ", finishedSites, "/", Abs(bppMap), " possible breakpoint locations<p>Processing rate of ", Format (finishedSites/tsf,5,2), " breakpoints/second.<p>",
						 steppingStr, "Projected time to finish this analysis is: ", Format(tsf*((Abs(bppMap)-finishedSites)/finishedSites)/stepping,8,2), " seconds</div><div class = 'RepClassSM'>So far...<p>",
						 reportImprovement (dAICc, 1, bppMap[ji], "cAIC"),"<p>",
						 reportImprovement (dAIC, 0, bppMap[ji], "AIC"),"<p>",
						 reportImprovement (dBIC, 2, bppMap[ji], "BIC"),"</DIV>"
						 
				);


		cachedString		 = tree1AVL[bppMap[ji]];
		Tree reportThisTree1 = cachedString; 
		cachedString		 = tree2AVL[bppMap[ji]];
		Tree reportThisTree2 = cachedString; 

		copyFromAVL (lf_MLE_VALUES, "givenTree0", "reportThisTree1");
		copyFromAVL (lf_MLE_VALUES, "givenTree1", "reportThisTree2");

		fprintf	(outputFilePath, bppMap[ji], "\t", myAIC, "\t", myAICc, "\t", myBIC, "\t", Format(reportThisTree1,1,1), "\t", Format(reportThisTree2,1,1), "\n");

		MasterList [ji][0] = bppMap[ji];
		MasterList [ji][1] = myAIC;
		MasterList [ji][2] = myAICc;
		MasterList [ji][3] = myBIC;
		
	}
	
	if (jobKind)
	{
		for (bpi=0; bpi<Abs(bppMap); bpi=bpi+1)
		{
			if (ResamplesDone[bpi] == 0)
			{
				if (Abs (MatrixList1[bpi]) > 0 && Abs (MatrixList2[bpi]) > 0)
				{
					runKHResampler (bpi);
				}
			}
		}
	}
	return fromNode-1;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function RunASample (jobIndex)
{	

	ConstraintString = "";
	LikelihoodFunctionString = "";
	ConstraintString * 8192;
	
	bpF2 = bppMap[jobIndex];
	filterString = "0-"+bpF2;		
	
	ConstraintString * ("DataSetFilter filteredData = CreateFilter(ds,1,\""+filterString+"\");");
	ConstraintString * ("DataSetFilter filteredData0 = CreateFilter (ds,1,\""+filterString+"\");");
	
	ConstraintString * ("InferTreeTopology (0);treeString=TreeMatrix2TreeString(0);Tree givenTree0 = treeString;");
					
	filterString = ""+(bpF2+1)+"-"+(ds.sites-1);		

	ConstraintString * ("DataSetFilter filteredData = CreateFilter(ds,1,\""+filterString+"\");");
	ConstraintString * ("DataSetFilter filteredData1 = CreateFilter (ds,1,\""+filterString+"\");");
	
	ConstraintString * ("InferTreeTopology (0);treeString=TreeMatrix2TreeString(0);Tree givenTree1 = treeString;");
	ConstraintString * 0;
	
	ExecuteCommands (ConstraintString);
	
	tree1AVL [bppMap[jobIndex]] = Format(givenTree0,1,1);
	tree2AVL [bppMap[jobIndex]] = Format(givenTree1,1,1);

	if ((MPI_NODE_COUNT>1) && (jobIndex>=0))
	{
		OPTIMIZE_SUMMATION_ORDER = 0;
	}
	LikelihoodFunction lf  = (filteredData0,givenTree0,filteredData1,givenTree1);
	
	if (khOption > 1)
	{
		Tree j_tree_0 = baseTreeString;
		Tree j_tree_1 = baseTreeString;
	}
	
		
	if ((MPI_NODE_COUNT>1) && (jobIndex>=0))
	{
		for (mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode+1)
		{
			if (MPINodeState[mpiNode][0]==0)
			{
				break;	
			}
		}
		if (mpiNode==MPI_NODE_COUNT-1)
		{
			mpiNode = ReceiveJobs (1,jobIndex,khOption>0);
		}
		else
		{
			MPISend 				  (mpiNode+1,lf);
			MPINodeState[mpiNode][0] = 1;
			MPINodeState[mpiNode][1] = jobIndex;
			MPINodeState[mpiNode][2] = khOption>0;
		}
	}
	else
	{
		Optimize (res,lf);
		
		if (jobIndex>=0)
		{
			mpiNode = ReceiveJobs (1, jobIndex, khOption>0);
			if (khOption)
			{
				if (khOption == 1)
				{
					LikelihoodFunction lf2 = (filteredData0,givenTree1,filteredData1,givenTree0);
				}
				else
				{
					LikelihoodFunction lf2 = (filteredData0,j_tree_0,filteredData1,j_tree_1);			
				}
				Optimize (res2,lf2);
				mpiNode = ReceiveJobs (1, jobIndex, 2);
			}
		}
		else
		{
			myAIC = 2*(res[1][0]-res[1][1]-baseParams);
		}
	}
	return 0;	
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function	reportImprovement (_score, _index, _site, _IC)
{
	if (_IC == "cAIC" && canUseAICc == 0)
	{
		return "cAIC can't be used with this alignment, as there are too few sites for the number of parameters.";
	}
	if (_score > bestScores[_index][0])
	{
		bestScores[_index][0] = _score;
		bestScores[_index][1] = _site;
	}
	
	if (bestScores[_index][0])
	{
		return _IC + " criterion indicates a breakpoint at " + bestScores[_index][1] + " with score improvement of " + bestScores[_index][0];
	}
	return _IC + " criterion indicates no evidence of recombination";
}


/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function	reportImprovementHTML (_index, _IC)
{
	if (bestScores[_index][0])
	{
		return "<tr><td>" + _IC + "</td><td> indicates a breakpoint at " + 
									 bestScores[_index][1] + 
									 " with a score improvement of " + 
									 bestScores[_index][0] + 
									 "<br><a href = 'http://www.hyphy.org/cgi-bin/GARD/SBPplot.pl?fileName=" + fileSpec + "&format=pdf&index="+_index+"'> [PDF Chart]</a>" + 
									 "<a href = 'http://www.hyphy.org/cgi-bin/GARD/SBPplot.pl?fileName=" + fileSpec + "&format=png&index="+_index+"'> [PNG Chart]</a>" + 
									 "<a href = 'http://www.hyphy.org/cgi-bin/GARD/SBPplot.pl?fileName=" + fileSpec + "&format=csv&index="+_index+"'> [CSV]</a>" + 
									 "<a href = 'http://www.hyphy.org/cgi-bin/GARD/SBPplot.pl?fileName=" + fileSpec + "&format=split&index="+_index+"'> [Best Split]</a>" + 
									 "<a href = '" + fileSpec + "_sbp." + _IC + "'> [Raw]</a></td></tr>";
								
	}
	return "<tr><td>" + _IC + "</td><td> indicates no evidence of recombination </td></tr>";
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function	outputSpan (_offset, _text)
{
	return "<span style = 'position: absolute; left: " + (140+_offset) + "px'>" + _text + "</span>";
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/

function	copyFromAVL (cachedAVL,oldID,newID)
{
	keys = Rows (cachedAVL);
	for (keyIterator = 0; keyIterator < Columns (keys); keyIterator = keyIterator + 1)
	{
	    matched = (keys[keyIterator])$("^"+oldID+"(\\..+)$");
	    if (matched[0]>=0)
	    {
	    	ExecuteCommands (newID+(keys[keyIterator])[matched[2]][matched[3]] + "=" + cachedAVL[keys[keyIterator]]);
	    }
	}
	return 0;
}

/*---------------------------------------------------------------------------------------------------------------------------------------------*/
