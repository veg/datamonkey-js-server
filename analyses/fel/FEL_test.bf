/* 

INPUT:

	file descriptor 		: upload.numbers.1
	tree mode				: 0-3 (which tree to use)
	gencodeid				: >=0 for a genetic code
	model description		: six string (nucleotides) 
	default p-value		    : a number between 0 and 1
	fel or ifel				: 0 - FEL; 1 - IFEL
	
OUTPUT:
	ERROR: anyting 
		FEL run failed with the stated problem
		
		[NUMBER]			: specified p-value
		[NMATRIX]			: fitted tree lengths
		[NUMBER]			: tree mode
		[NMATRIX]			: FEL result matrix
		
*/	

RequireVersion  ("0.9920060815");

fscanf  			(stdin,"String",_in_FilePath);
fscanf  			(stdin,"Number",treeMode);
fscanf				(stdin,"Number", _in_GeneticCodeTable);
fscanf  			(stdin,"String",_in_ModelDescription);
fscanf  			(stdin,"Number",_in_dNdSPValue);
fscanf  			(stdin,"Number",_in_FELorIFEL);

timer = Time(1);

skipCodeSelectionStep = 1;
ExecuteAFile("../Shared/chooseGeneticCode.def");
ExecuteAFile("../Shared/globals.ibf");
ExecuteAFile("../Shared/GrabBag.bf");
finishedPatterns = 0;

ApplyGeneticCodeTable (_in_GeneticCodeTable);

GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath);
rootOn = "";
analysisSpecRaw     = _getRawTreeSplits (_in_FilePath, "treeMode", "rootOn");

baseFilePath  		= "spool/"+_in_FilePath;
if (_in_FELorIFEL)
{
   baseFilePath = baseFilePath + "_ifel";
}
intermediateHTML	= baseFilePath + ".progress";
finalPHP			= baseFilePath + ".out";

fprintf				(intermediateHTML, CLEAR_FILE);
ExecuteAFile 		("qndhelper1_mf.ibf");


SHORT_MPI_RETURN 	= 1;

brOptions			= _in_FELorIFEL;

global			sFactor = 1;
global			nFactor = 1;

if (brOptions > 0)
{
	doneSites    = {totalUniqueSites,7};
	fullSites    = {totalCodonCount ,7};						
	labels = {{"dS","dN Internal","dN Leaves","dS when (dN=dS)","log(L)","LRT for dN!=dS","p-value"}};
			 /*  0       1             2              3             4          5              6     */
	shiftI	= 0;
}
else
{
	doneSites    = {totalUniqueSites,6};
	fullSites    = {totalCodonCount ,6};
	labels = {{"dS","dN","dS when (dN=dS)","log(L)","LRT for dN!=dS","p-value"}};
			 /*  0    1          2           3                4             5   */
	shiftI = 1;
}

ExecuteAFile 		("qndhelper2_mf.ibf");

MPINodeState 		= {MPI_NODE_COUNT-1,5};
treeLengths 		= {fileCount,1};
FEL_RUN_TIMER    	= Time(1);

vOffset  = 0;
vuOffset = 0;
alreadyDone = {totalUniqueSites,1};

for (fileID = 1; fileID <= fileCount; fileID = fileID+1)
{
	ClearConstraints (siteTree);
	Tree		   	  siteTree = treeStrings[fileID];
	
	ExecuteCommands ("GetDataInfo  (dupInfo, filteredData_"+fileID+");");			
	ExecuteCommands ("thisFilterSize  = filteredData_"+fileID+".sites;");			
	ExecuteCommands ("thisFilterSizeU = filteredData_"+fileID+".unique_sites;");
	
	sFactor = 1;
	nFactor = 1;			
	
	ExecuteCommands ("ReplicateConstraint(\"this1.?.synRate:=sFactor*this2.?.synRate__\",siteTree,codonTree_"+fileID+");");
	
	if (brOptions == 1)
	{
		global nFactorOther = 1;
		ExecuteCommands ("ReplicateConstraint(\"this1.Node?.nonSynRate:=nFactor*this2.Node?.synRate__\",siteTree,codonTree_"+fileID+");");
		ExecuteCommands ("ReplicateConstraint(\"this1.?.nonSynRate:=nFactorOther*this2.?.synRate__\",siteTree,codonTree_"+fileID+");");
	}
	else
	{
		ExecuteCommands ("ReplicateConstraint(\"this1.?.nonSynRate:=nFactor*this2.?.synRate__\",siteTree,codonTree_"+fileID+");");
	}
	
	ExecuteCommands ("bl_vec = BranchLength(codonTree_"+fileID+",-1);");
	treeLengths [fileID-1] = (bl_vec*((Transpose(bl_vec))["1"]))[0];
	
	lfSpawnDone = 0;
				
	for (siteCount = 0; siteCount < thisFilterSize; siteCount = siteCount+1)
	{
		siteMap = dupInfo[siteCount];
		if (alreadyDone[siteMap+vuOffset] == 0)
		{
			filterString = "";
			filterString = filterString + (siteCount*3) + "-" + (siteCount*3+2);
			ExecuteCommands ("DataSetFilter siteFilter = CreateFilter (ds_"+fileID+",3,filterString,\"\",GeneticCodeExclusions);");

			HarvestFrequencies (f1, siteFilter, 3, 3, 0);
			m1 = 0;
			for (mpiNode=0; mpiNode < 64; mpiNode=mpiNode+1)
			{
				if (f1[mpiNode]>0)
				{
					m1=m1+1;
				}
			}
			
			siteMap = siteMap + vuOffset;
			alreadyDone[siteMap] = 1;				
			if (m1>1)
			{
				sFactor = 1;
				nFactor	= 1;
				
				if (lfSpawnDone == 0)
				{
					LikelihoodFunction siteLikelihood = (siteFilter, siteTree);	
					LIKELIHOOD_FUNCTION_OUTPUT = 7;
					lfSpawnDone = 1;
				}
							
				for (mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode+1)
				{
					if (MPINodeState[mpiNode][0]==0)
					{
						break;	
					}
				}
				
				if (mpiNode==MPI_NODE_COUNT-1)
				{
					mpiNode = ReceiveJobs2 (1,1,siteCount+vOffset,siteMap);
				}
				else
				{
					MPISend (mpiNode+1,siteLikelihood);
					fprintf (stdout, "SENT NULL FOR SITE ", siteCount, " TO NODE ", mpiNode + 1, "\n");
					dumpName = "LFDump/"+siteCount+".alternative";
					fprintf (dumpName,CLEAR_FILE, siteLikelihood);
					MPINodeState[mpiNode][0] = 1;
					MPINodeState[mpiNode][1] = siteCount+vOffset;
					MPINodeState[mpiNode][2] = 1;
					MPINodeState[mpiNode][3] = siteMap;
					MPINodeState[mpiNode][4] = MPINodeState[mpiNode][4] + 1;
					
				}
				
				m1 = sFactor+nFactor;
				sFactor 	= m1/2;
				nFactor:=sFactor;

				for (mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode+1)
				{
					if (MPINodeState[mpiNode][0]==0)
					{
						break;	
					}
				}
				
				if (mpiNode==MPI_NODE_COUNT-1)
				{
					mpiNode = ReceiveJobs2 (1,0,siteCount+vOffset,siteMap);
				}
				else
				{
					MPISend (mpiNode+1,siteLikelihood);
					fprintf (stdout, "SENT ALTERNATIVE FOR SITE ", siteCount, " TO NODE ", mpiNode + 1, "\n");
					dumpName = "LFDump/"+siteCount+".null";
					fprintf (dumpName,CLEAR_FILE, siteLikelihood);
					MPINodeState[mpiNode][0] = 1;
					MPINodeState[mpiNode][1] = siteCount+vOffset;
					MPINodeState[mpiNode][3] = siteMap;
					MPINodeState[mpiNode][2] = 0;
				}
			}
			else
			{
                doneSites[siteMap][Columns(labels)-1] = 1;									
			}
		}
	}					
	vOffset 	= vOffset  + thisFilterSize;
	vuOffset 	= vuOffset + thisFilterSizeU;
}
	
while (1)
{
	for (nodeCounter = 0; nodeCounter < MPI_NODE_COUNT-1; nodeCounter = nodeCounter+1)
	{
		if (MPINodeState[nodeCounter][0]==1)
		{
			fprintf (stdout, MPINodeState[nodeCounter][-1], "\n");
			fromNode = ReceiveJobs2 (0,0,0,0);
			break;	
		}
	}
	if (nodeCounter == MPI_NODE_COUNT-1)
	{
		break;
	}
}					
vOffset  = 0;
vuOffset = 0;

alreadyDone = {totalUniqueSites,1};

posSelected = 0;
negSelected = 0;

for (fileID = 1; fileID <= fileCount; fileID = fileID+1)
{
	ExecuteCommands ("GetDataInfo  (dupInfo, filteredData_"+fileID+");");			
	ExecuteCommands ("thisFilterSize  = filteredData_"+fileID+".sites;");			
	ExecuteCommands ("thisFilterSizeU = filteredData_"+fileID+".unique_sites;");			
	for (siteCount = 0; siteCount < thisFilterSize; siteCount = siteCount+1)
	{
		siteMap = dupInfo[siteCount];
		ReportSite2 (siteCount+vOffset, siteMap+vuOffset);	
		if (fullSites[siteCount+vOffset][6-shiftI] <= _in_dNdSPValue)
		{
			if (fullSites[siteCount+vOffset][0] < fullSites[siteCount+vOffset][1])
			{
				posSelected = posSelected + 1;
			}
			else
			{
				negSelected = negSelected + 1;
			}
		}
	}
	vOffset 	= vOffset  + thisFilterSize;
	vuOffset 	= vuOffset + thisFilterSizeU;
}

fprintf (finalPHP, CLEAR_FILE, _in_dNdSPValue, "\n", treeLengths, "\n", treeMode, "\n", fullSites);

/*------------------------------------------------------------------------*/

function ReportSite2 (siteI, siteM)
{
	if (doneSites[siteM][6-shiftI]<=_in_dNdSPValue)
	{
		if (doneSites[siteM][1]>doneSites[siteM][0])
		{
			fprintf (intermediateHTML, "<TR class = 'TRReportPS'>");
		}
		else
		{
			fprintf (intermediateHTML, "<TR class = 'TRReportNS'>");
		}
	}
	else
	{
		fprintf (intermediateHTML, "<TR class = 'TRReportNT'>");	
	}
	
	fprintf (intermediateHTML, "<TD>", siteI+1, "</TD>");
	for (mxI = 0; mxI < Columns (labels); mxI = mxI + 1)
	{
		fullSites[siteI][mxI] = doneSites[siteM][mxI];
		fprintf (intermediateHTML, "<TD>",Format(fullSites[siteI][mxI],8,2),"</TD>");
	}
	fprintf (intermediateHTML, "<TD>",Format ((Time(1) - FEL_RUN_TIMER+1)*((totalUniqueSites-finishedPatterns+1)/(1+finishedPatterns)),10,1),"</TD></TR>\n");
	return 0;
}

/*------------------------------------------------------------------------*/

function ReceiveJobs2 (sendOrNot, nullAlt,_siteCount,_siteMap)
{
	MPIReceive (-1, fromNode, result_String);
	
	siteIndex 		= MPINodeState[fromNode-1][1];
	siteNA	  		= MPINodeState[fromNode-1][2];
	siteIndexMap	= MPINodeState[fromNode-1][3];
	
	
	if (sendOrNot)
	{
		MPISend (fromNode,siteLikelihood);
		MPINodeState[fromNode-1][1] = _siteCount;			
		MPINodeState[fromNode-1][2] = nullAlt;		
		if (nullAlt)
		{
			fprintf (stdout, "SENT ALTERNATIVE FOR SITE ", _siteCount, " TO NODE ", fromNode, "\n");
			dumpName = "LFDump/"+siteCount+".alternative";
		}
		else
		{
			fprintf (stdout, "SENT NULL FOR SITE ", _siteCount, " TO NODE ", fromNode, "\n");
			dumpName = "LFDump/"+siteCount+".null";		
		}
		
		fprintf (dumpName,CLEAR_FILE, siteLikelihood);
		MPINodeState[fromNode-1][3] = _siteMap;			
		MPINodeState[fromNode-1][4] = MPINodeState[fromNode-1][4]+1;			
	}
	else
	{
		MPINodeState[fromNode-1][0] = 0;
		MPINodeState[fromNode-1][1] = -1;		
	}
	
	ExecuteCommands (result_String);
	
	nFValue = siteLikelihood_MLE_VALUES ["nFactor"];
	sFValue = siteLikelihood_MLE_VALUES ["sFactor"];
	if (shiftI == 0)
	{
		noFValue = siteLikelihood_MLE_VALUES ["nFactorOther"];
	}
	
	if (siteNA)
	{
		doneSites[siteIndexMap][1] = nFValue;
		doneSites[siteIndexMap][0] = sFValue;
		
		if (shiftI == 0)
		{
			doneSites[siteIndexMap][2] = noFValue;
		}
			
		doneSites[siteIndexMap][5-shiftI] = doneSites[siteIndexMap][5-shiftI]+2*siteLikelihood_MLES[1][0];
		doneSites[siteIndexMap][4-shiftI] = siteLikelihood_MLES[1][0];
	}
	else
	{
		doneSites[siteIndexMap][5-shiftI] = doneSites[siteIndexMap][5-shiftI]-2*siteLikelihood_MLES[1][0];	
		doneSites[siteIndexMap][3-shiftI] = sFValue;
	}

	if (doneSites[siteIndexMap][6-shiftI] == 0)
	{
		doneSites[siteIndexMap][6-shiftI] = -1;
	}
	else
	{
		if (doneSites[siteIndexMap][6-shiftI] == (-1))
		{
			finishedPatterns = finishedPatterns + 1;
			doneSites[siteIndexMap][6-shiftI] = 1-CChi2(doneSites[siteIndexMap][5-shiftI],1);						
			ReportSite2 (siteIndex, siteIndexMap);
		}
	}
	
	return fromNode-1;
}

fprintf (intermediateHTML,CLEAR_FILE,"DONE");
GetString (HTML_OUT, TIME_STAMP, 1);
fprintf ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",ds_0.species,",",ds_0.sites/3,",",Time(1)-timer,",",_in_ModelDescription,",",posSelected,",",negSelected,",",_in_dNdSPValue,"\n");
