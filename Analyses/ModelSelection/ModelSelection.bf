

HTML_HEADER_PLACEHOLDER	  = "Model Selection Results";
ExecuteAFile			   ("../Shared/globals.ibf");
ExecuteAFile			   ("../Shared/GrabBag.bf");

/* FUNCTIONS */
/* --------------------------------------------------------------------------------------------------------------------------- */

function checkEmbedding (_m1, _m2)
{
	for (r=0; r<6; r=r+1)
	{
		if (_m2[r]<_m1[r])
		{
			return 0;
		}
		if (_m2[r]>_m1[r])
		{
			for (r2 = 0; r2 < 6; r2 = r2+1)
			{
				if ((_m2[r2]==_m2[r])&&(_m1[r2]!=_m1[r]))
				{
					return 0;
				}
			}
		}
	}
	return 1;
}

/* --------------------------------------------------------------------------------------------------------------------------- */

function ReceiveJobs (sendOrNot)
{
	MPIReceive (-1, fromNode, result_String);
	jobModelNum = MPINodeState[fromNode-1][1];
	fprintf (MESSAGE_LOG, "Got results for ", jobModelNum, " from node ", fromNode-1, "\n");
	vv1 = MPINodeState[fromNode-1][2];
	vv2 = MPINodeState[fromNode-1][3];
	vv3 = MPINodeState[fromNode-1][4];
	vv4 = MPINodeState[fromNode-1][5];
	vv5 = MPINodeState[fromNode-1][6];
	vv6 = MPINodeState[fromNode-1][7];
	if (sendOrNot)
	{
		fprintf (MESSAGE_LOG, "Sent model ", modelNum, " to node ", fromNode-1, "\n");
		MPISend (fromNode,lf);
		MPINodeState[fromNode-1][1] = modelNum;		
		MPINodeState[fromNode-1][2] = v1;
		MPINodeState[fromNode-1][3] = v2;
		MPINodeState[fromNode-1][4] = v3;
		MPINodeState[fromNode-1][5] = v4;
		MPINodeState[fromNode-1][6] = v5;
		MPINodeState[fromNode-1][7] = v6;
	}
	else
	{
		MPINodeState[fromNode-1][0] = 0;
		MPINodeState[fromNode-1][1] = -1;		
	}
	
	ExecuteCommands (result_String);
	
	if (jobModelNum == 0)
	{
		stdl   = lf_MLES[1][0];
		fullnp = lf_MLES[1][1]+totalBranchCount+3;
		outHTML * ("<DIV CLASS = 'RepClassSM'> <b>Phase I: testing all models vs the GTR </b><p> General reversible model (012345) fit. Ln-likelihood =  " + stdl + ". Parameter Count = " + Format(fullnp,0,0) +
					". AIC = " + 2*(fullnp-stdl) + "\n");


		resultCache [0][0] = 1;
		resultCache [0][1] = 2;
		resultCache [0][2] = 3;
		resultCache [0][3] = 4;
		resultCache [0][4] = 5;
		resultCache [0][5] = lf_MLES[1][0];
		resultCache [0][6] = lf_MLES[1][1]+totalBranchCount+3;
		resultCache [0][7] = 0;
		resultCache [0][8] = 0;
		
		stashedREVEstimates = {{AC__,AT__,CG__,CT__,GT__}};
		
		outHTML * ("\n<p><TABLE BORDER = '0' CELLSPACING = '2'><TR CLASS = 'HeaderClassSM'><TD>Index</TD><TD>Model</TD><TD># prm</TD><TD>lnL</TD><TD>LRT</TD><TD>AIC</TD><TD>p-Value</TD></TR>\n");   

		for (h=1; h<203; h=h+1)
		{
			lnL = resultCache[h][5];
			
			if (lnL<0)
			{
				np = resultCache[h][6];
				LRT = Max(0,2*(stdl-lnL));
				AIC = -2*lnL+2*np;
				pValue = 1-CChi2(LRT,fullnp-np);
				
				resultCache [jobModelNum][7] = pValue;
				if (pValue<rejectAt)
				{
					rejectCount = rejectCount+1;
					resultCache [jobModelNum][8] = 0;
					outHTML * ("<TR CLASS = 'TRReportPS' style = 'font-size:10px;'>");
				}
				else
				{
					outHTML * ("<TR CLASS = 'TRReportNS' style = 'font-size:10px;'>");
					resultCache [jobModelNum][8] = 1;					
				}
				
				outHTML * ("<TD>"+Format(h,3,0)+
						   "</TD><TD>(0"+Format(resultCache[h][0],1,0)+
						   Format(resultCache[h][1],1,0)+
						   Format(resultCache[h][2],1,0)+
						   Format(resultCache[h][3],1,0)+
						   Format(resultCache[h][4],1,0)+
						   ")</TD><TD></TR>\n");
			}
		}
		
		return fromNode-1;
	}
	else
	{
		if ((MPI_NODE_COUNT>1)&&(resultCache[0][5]>=0))
		{
			resultCache [jobModelNum][0] = vv2;
			resultCache [jobModelNum][1] = vv3;
			resultCache [jobModelNum][2] = vv4;
			resultCache [jobModelNum][3] = vv5;
			resultCache [jobModelNum][4] = vv6;
			resultCache [jobModelNum][5] = lf_MLES[1][0];
			resultCache [jobModelNum][6] = lf_MLES[1][1]+totalBranchCount+3;
						
			return fromNode - 1;
		}
	}

	np = lf_MLES[1][1]+3+totalBranchCount;
	lnL = lf_MLES[1][0];
	LRT = -2*(lnL-stdl);
	if (LRT<0)
	{
		LRT = 0;
	}
	AIC = -2*lnL+2*np;
	if (LRT==0)
	{
		pValue = 1;					
	}
	else
	{
		pValue = 1-CChi2(LRT,fullnp-np);
	}
	
	resultCache [jobModelNum][0] = vv2;
	resultCache [jobModelNum][1] = vv3;
	resultCache [jobModelNum][2] = vv4;
	resultCache [jobModelNum][3] = vv5;
	resultCache [jobModelNum][4] = vv6;
	resultCache [jobModelNum][5] = lf_MLES[1][0];
	resultCache [jobModelNum][6] = lf_MLES[1][1]+3+totalBranchCount;
	resultCache [jobModelNum][7] = pValue;

	if (pValue<rejectAt)
	{
		rejectCount = rejectCount+1;
		resultCache [jobModelNum][8] = 0;
		outHTML * ("<TR CLASS = 'TRReportPS'  style = 'font-size:10px;'>");
	}
	else
	{
		resultCache [jobModelNum][8] = 1;					
		outHTML * ("<TR CLASS = 'TRReportNS'  style = 'font-size:10px;'>");
	}
	
	outHTML * ("<TD>"+Format(jobModelNum,3,0)+"</TD><TD>(0"+Format(vv2,1,0)+Format(vv3,1,0)+Format(vv4,1,0)+
					 Format(vv5,1,0)+Format(vv6,1,0)+")</TD><TD>"+np+"</TD><TD>"+lnL+"</TD><TD>"+Format(LRT,14,3)+"</TD><TD>"+AIC+"</TD><TD>"+pValue+"</TD></TR>\n");
	
			
	finishedModels = finishedModels + 1;
	siteNA =  Time(1)-startTimer;
	siteIndex = ((filteredData.unique_sites-finishedModels)/finishedModels*siteNA+0.5)$1;
	fprintf (progressFilePath, CLEAR_FILE, "<DIV CLASS = 'RepClassSM'><b>MODEL SELECTION PROGRESS</b> \n", 
										   finishedModels, 
										   "/203",  
										   " models processed<br>",
										   "Total time running: ", 
										   siteNA$3600, " hours ", (siteNA-siteNA$3600*3600)$60 , " minutes and ", siteNA%60, 
										   " seconds.<br>Projected remaining time: ", 
										   siteIndex$3600, " hours ", (siteIndex-siteIndex$3600*3600)$60 , " minutes and ", siteIndex%60, 
										   " seconds.</DIV>");

	return fromNode-1;
}


/* --------------------------------------------------------------------------------------------------------------------------- */

function printModelMatrix (modelString)
{
	modelHTML = "";
	modelHTML * 1024;
	
	modelHTML * ("<table border = '0'><tr class = 'HeaderClassSM'><th width = '100'>To/From</th><th width = '100'>A</th><th width = '100'>C</th ><th width = '100'>G</th><th width = '100'>T</th></tr>\n");

	if (modelString[1] == "0")
	{
		subsTable	= {{"1","1","AT","CG","CT","GT"}};		
	}
	else
	{
		subsTable	= {{"AC","1","AT","CG","CT","GT"}};	
	}
	
	for (v2 = 2; v2 < 6; v2=v2+1)
	{
		for (v3 = 0; v3 < v2; v3 = v3 + 1)
		{
			if (modelString[v3] == modelString[v2])
			{
				subsTable[v2] = subsTable[v3];
				break;
			}
		}
	}
	
	modelHTML * ("<tr class = 'ModelClass1'><th class = 'HeaderClassSM'>A</th><td>&#42;</td><td>"+subsTable[0]+"</td><td>"+subsTable[1]+"</td><td>"+subsTable[2]+"</td></tr>\n");
	modelHTML * ("<tr class = 'ModelClass2'><th class = 'HeaderClassSM'>C</th><td>&#45;</td><td>&#42;</td><td>"+subsTable[3]+"</td><td>"+subsTable[4]+"</td></tr>\n");
	modelHTML * ("<tr class = 'ModelClass1'><th class = 'HeaderClassSM'>G</th><td>&#45;</td><td>&#45;</td><td>&#42;</td><td>"+subsTable[5]+"</td></tr>\n");
	modelHTML * ("<tr class = 'ModelClass2'><th class = 'HeaderClassSM'>T</th><td>&#45;</td><td>&#45;</td><td>&#45;</td><td>&#42;</td></tr>\n</table>");
	
	modelHTML * 0;
	return modelHTML;
}

/* --------------------------------------------------------------------------------------------------------------------------- */


VERBOSITY_LEVEL 		= -1;
SHORT_MPI_RETURN 		= 1;

outHTML 				= "";
outHTML 				* 65536;

finishedModels 			= 0;
modelType     			= 1;
branchLengths 			= 1;

global 					AC = 0.5;
global				 	AT = AC;
global 					CG = AC;
global 					CT = 1.;
global 					GT = AC;

m = 				 {{*,AC*t,t,AT*t}
					 {AC*t,*,CG*t,CT*t}
					 {t,CG*t,*,GT*t}
					 {AT*t,CT*t,GT*t,*}};
	 
fscanf  			(stdin,"String",fileSpec);
fscanf  			(stdin,"Number",rejectAt);

GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec);
GetURL				(analysisSpecRaw, _getTreeLink (fileSpec,1,0));
if (Abs (analysisSpecRaw) == 0)
{
GetURL                          (analysisSpecRaw, _getTreeLink (fileSpec,0,0));
}

/*
GetURL 				(analysisSpecRaw,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec+".splits");
*/


ExecuteAFile		("../Shared/_MFReader_.ibf");

baseFilePath  		= "spool/"+fileSpec;
progressFilePath	= baseFilePath + ".progress";
outputFilePath		= baseFilePath + ".out";

fprintf							(progressFilePath, CLEAR_FILE, "<DIV class = 'RepClassSM'><b>MODEL SELECTION PROGRESS.</b>Fitting the REV model to obtain branch length estimates and the alternative log likelihood score.</DIV>");


KEEP_OPTIMAL_ORDER 				= 1;
MESSAGE_LOGGING    				= 0;

totalBranchCount 				= 0;
modelNum						= 0;
rejectCount 					= 0;
resultCache 					= {203,9};

Model currentModel 				= (m,overallFrequencies);

populateTrees 					("T",fileCount);
ExecuteCommands(constructLF  	("lf","nucData","T",fileCount));

MPINodeState 					= {MPI_NODE_COUNT-1,8};
OPTIMIZE_SUMMATION_ORDER 		= 0;
SHORT_MPI_RETURN 				= 0;

MPISend 						(1,lf);

MPINodeState[0][0] 				= 1;
MPINodeState[0][1] 				= modelNum;

ReceiveJobs 					(0);

SHORT_MPI_RETURN 				= 1;
fprintf							 (progressFilePath, CLEAR_FILE, "<DIV CLASS = 'RepClassSM'><b>MODEL SELECTION PROGRESS</b> Initial REV model fit is complete\nREV model log-likelihood score is ", lf_MLES[1][0], "</DIV>");
startTimer 						= Time (1);


stashedBL			 = {};
stashedBN			 = {};
stashedBC			 = {};

pia 				 = overallFrequencies[0];
pic 				 = overallFrequencies[1];
pig 				 = overallFrequencies[2];
pit 				 = overallFrequencies[3];

global totalFactor 		:= AC*(2*pia__*pic__)+2*pia__*pig__+(2*pia__*pit__)*AT+(2*pic__*pig__)*CG+(2*pic__*pit__)*CT+(2*pig__*pit__)*GT;


for (fileID = 1; fileID <= fileCount; fileID = fileID + 1)
{
	ExecuteCommands		 ("thisTreeBC  = TipCount(T_"+fileID+") + BranchCount (T_"+fileID+");");
	ExecuteCommands		 ("stashedBL	 [fileID] = BranchLength (T_"+fileID+",-1);");
	ExecuteCommands		 ("stashedBN	 [fileID] = BranchName   (T_"+fileID+",-1);");
	stashedBC[fileID]  = thisTreeBC;
	totalBranchCount   = totalBranchCount + thisTreeBC;
}

rateBiasTerms = {{"AC","1","AT","CG","CT","GT"}};

for (v2=0; v2<=1; v2=v2+1)
{
	for (v3=0; v3<=v2+1; v3=v3+1)
	{
		ub4 = Max(v2,v3);
		for (v4=0; v4<=ub4+1; v4=v4+1)
		{
			ub5 = Max(v4,ub4);
			for (v5=0; v5<=ub5+1; v5=v5+1)
			{
				ub6 = Max(v5,ub5);
				for (v6=0; v6<=ub6+1; v6=v6+1)
				{
					if (v6==5)
					{
						break;
					}
					
					paramCount	          = 0;
					modelDesc 	  		  = "0"+Format(v2,1,0)+Format(v3,1,0)+Format(v4,1,0)+Format(v5,1,0)+Format(v6,1,0);
					
					modelConstraintString = "";
					
					AC = stashedREVEstimates[0];
					AT = stashedREVEstimates[1];
					CG = stashedREVEstimates[2];
					CT = stashedREVEstimates[3];
					GT = stashedREVEstimates[4];

					for (customLoopCounter2=1; customLoopCounter2<6; customLoopCounter2=customLoopCounter2+1)
					{
						for (customLoopCounter=0; customLoopCounter<customLoopCounter2; customLoopCounter=customLoopCounter+1)
						{
							if (modelDesc[customLoopCounter2]==modelDesc[customLoopCounter])
							{
								if (rateBiasTerms[customLoopCounter2] == "1")
								{
									modelConstraintString = modelConstraintString + rateBiasTerms[customLoopCounter]+":="+rateBiasTerms[customLoopCounter2]+";";
								}
								else
								{
									modelConstraintString = modelConstraintString + rateBiasTerms[customLoopCounter2]+":="+rateBiasTerms[customLoopCounter]+";";			
								}
								break;
							}
						}
					}	

					if (Abs(modelConstraintString))
					{
						ExecuteCommands (modelConstraintString);
					}
									
					Model currentModel 				= (m,overallFrequencies);
					
					populateTrees 					("T",fileCount);
										
					for (fileID = 1; fileID <= fileCount; fileID = fileID + 1)
					{
						trName = "T_"+fileID+".";
						for (mpiNode = 0; mpiNode < stashedBC[fileID]; mpiNode = mpiNode+1)
						{
							eCommand = trName+(stashedBN[fileID])[mpiNode]+".t:<1e25;"+
									   trName+(stashedBN[fileID])[mpiNode]+".t:="+
									 Format((stashedBL[fileID])[mpiNode],20,12)+"/totalFactor";
									 
							ExecuteCommands (eCommand);
						}
					}

					
					ExecuteCommands(constructLF  	("lf","nucData","T",fileCount));
					modelNum 						= modelNum+1;
					if (MPI_NODE_COUNT>1)
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
							mpiNode = ReceiveJobs (1);
						}
						else
						{
							MPISend (mpiNode+1,lf);
							MPINodeState[mpiNode][0] = 1;
							MPINodeState[mpiNode][1] = modelNum;
							MPINodeState[mpiNode][2] = v1;
							MPINodeState[mpiNode][3] = v2;
							MPINodeState[mpiNode][4] = v3;
							MPINodeState[mpiNode][5] = v4;
							MPINodeState[mpiNode][6] = v5;
							MPINodeState[mpiNode][7] = v6;
						}
					}
				}
			}
		}
	}

}

if (MPI_NODE_COUNT>1)
{
	while (1)
	{
		for (nodeCounter = 0; nodeCounter < MPI_NODE_COUNT-1; nodeCounter = nodeCounter+1)
		{
			if (MPINodeState[nodeCounter][0]==1)
			{
				fromNode = ReceiveJobs (0);
				break;	
			}
		}
		if (nodeCounter == MPI_NODE_COUNT-1)
		{
			break;
		}
	}	
	OPTIMIZE_SUMMATION_ORDER = 1;
}

PRINT_DIGITS = 0;

outHTML * ("</TABLE></DIV><DIV CLASS = 'RepClassSM'>" + "\nRejected " + rejectCount + " models.<p>");

if (rejectCount<202)
{

	outHTML * ("\n<p><b>Phase 2: Nested tests on the remaining models...</b><p> <TABLE BORDER = '0' CELLSPACING = '3'><TR CLASS = 'HeaderClassSM'><TD>Null Model</TD><TD>Alternative Model</TD><TD>&chi;^2 p-value</TD><TD>Decision</TD></TR>\n");

	v6 = 0;
	
	done = 0;
	while (!done)
	{
		done = 1;
		for (v2=1; v2<203; v2=v2+1)
		{
			if (resultCache[v2][8])
			{
				modelString = "0";
				for (v3 = 0; v3<5; v3=v3+1)
				{
					modelString = modelString + Format(resultCache [v2][v3],1,0);
				}
				for (v3 = v2+1; v3<203; v3 = v3+1)
				{
					if (resultCache[v3][8])
					{
						modelString2 = "0";
						for (v4 = 0; v4<5; v4=v4+1)
						{
							modelString2 = modelString2 + Format(resultCache [v3][v4],1,0);
						}	
						if (checkEmbedding (modelString, modelString2))
						{
							if (v6%2)
							{
								outHTML * ("<TR CLASS = 'TRReport1' style = 'font-size:10px;'>");
							}
							else
							{
								outHTML * ("<TR CLASS = 'TRReport2' style = 'font-size:10px;'>");
							}
							v6 = v6 + 1;
							outHTML * ("<TD>(" + modelString + ")</TD><TD>(" + modelString2 + ")</TD>");
							done = 0;
							LRT = 2*(resultCache[v3][5]-resultCache[v2][5]);
							npd = resultCache[v3][6]-resultCache[v2][6];
							if (LRT<0)
							{
								pValue = 1;
							}
							else
							{
								pValue = 1-CChi2(LRT,npd);
							}
							outHTML * ("<TD>" + Format (pValue,10,3) + "</TD><TD>\n");
							if (pValue<rejectAt)
							{
								outHTML * ("Rejected Null</TD></TR>");
								resultCache[v2][8] = 0;
								break;
							}
							else
							{
								outHTML * ("Failed to reject Null</TD></TR>\n");
								resultCache[v3][8] = 0;
							}
						}
					}
				}
			}
		}
	}

	
	outHTML * ("\n</TABLE></DIV>\n<DIV CLASS = 'RepClassSM'>\n<b>Phase 3: AIC selection on the remaining models:</b><p><TABLE BORDER = '0' CELLSPACING = '5'><TR class = 'HeaderClass'> <TD>Index</TD><TD>Model</TD><TD># prm</TD><TD>lnL</TD><TD>LRT</TD><TD>AIC</TD><TD>p-Value</TD></TR>\n");   
	
	modelNum = 0;  
	v5 = 1e10;
	v4 = 0;
	
	v6 = 0;
	
	for (v2=1; v2<203; v2=v2+1)
	{
		if (resultCache[v2][8])
		{
			np  = resultCache[v2][6];
			lnL = resultCache[v2][5];
			AIC = -2*lnL+2*np;
			modelNum = 0;
			modelString = "0";
			for (v3 = 0; v3<5; v3=v3+1)
			{
				modelString = modelString + resultCache [v2][v3];
			}
			LRT = -2*(lnL-stdl);
			if (LRT<0)
			{
				LRT = 0;
			}
			modelNum = modelNum + 1;
			if (v6%2)
			{
				outHTML * ("<TR CLASS = 'TRReport1'  style = 'font-size:10px;'>");
			}
			else
			{
				outHTML * ("<TR CLASS = 'TRReport2'  style = 'font-size:10px;'>");
			}			
			v6 = v6 + 1;
			outHTML * ("<TD>" + v2 + 
					   "</TD><TD>"+ modelString+
					   "</TD><TD>"+Format (np,5,0)+ 
					   "</TD><TD>" + lnL + 
					   "</TD><TD>" + Format(LRT,14,3) + 
					   "</TD><TD>" + AIC + "</TD>");
			PRINT_DIGITS = 15;
			pValue = 1-CChi2(LRT,fullnp-np);
		
			if (AIC<v5)
			{
				v5 = AIC;
				v4 = v2;
			}
			outHTML * ("<TD>"+pValue+"</TD></TR>\n");
		}
	}
	
	outHTML * ("</TABLE></DIV>\n"); 

	PRINT_DIGITS = 0;
	modelString = "0";
	for (v3 = 0; v3<5; v3=v3+1)
	{
		modelString = modelString + Format(resultCache [v4][v3],0,0);
	}
	
	mHTML = "Best model: (" + modelString + ") with AIC of " + v5 + "<p>" + printModelMatrix (modelString);
	
	namedModelList = {};
	namedModelList ["000000"] = "F81";
	namedModelList ["010010"] = "HKY85";
	namedModelList ["010020"] = "TrN";
	
	modelString2 = namedModelList[modelString];
	if (Abs(modelString2))
	{
		mHTML = mHTML + "<p>This model is better known as: <b>" + modelString2 + "</b> model\n";
	}
}
else
{
	mHTML = printModelMatrix ("012345") + "<p> General Reversible (GTR) model is the winner.";
} 

outHTML * 0;

fprintf (progressFilePath, CLEAR_FILE, "DONE");

fprintf (outputFilePath,  CLEAR_FILE, modelString, "\n<DIV CLASS = 'RepClassSM'>",
				  mHTML,"</DIV><DIV CLASS = 'WarnClassSM'>Details of the model selection analysis</DIV>",outHTML);


GetString (HTML_OUT, TIME_STAMP, 1);
fprintf   ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",ds_0.species,",",ds_0.sites/3,",",Time(1)-startTimer,",",modelString,"\n");

