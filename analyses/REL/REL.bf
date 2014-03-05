timer = Time(1);

RequireVersion  ("0.9920060815");

fscanf  			(stdin,"String",_in_FilePath);
fscanf				(stdin,"Number", _in_GeneticCodeTable);
fscanf  			(stdin,"String",_in_ModelDescription);
fscanf  			(stdin,"Number",_in_BayesFactor);
fscanf  			(stdin,"Number",treeMode);

timer = Time(1);

skipCodeSelectionStep    = 1;
ExecuteAFile			("../Shared/chooseGeneticCode.def");
ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");

ApplyGeneticCodeTable (_in_GeneticCodeTable);

modelDesc			= _in_ModelDescription;


GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath);
rootOn = "";
analysisSpecRaw     = _getRawTreeSplits (_in_FilePath, "treeMode", "rootOn");


/*
GetURL 				(analysisSpecRaw,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath+".splits");
*/
baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalPHP			= baseFilePath + ".out";

ExecuteAFile			("../Shared/_MFReader_.ibf");

fprintf				(intermediateHTML, CLEAR_FILE);
VERBOSITY_LEVEL		= 1;
SAVE_OPT_STATUS_TO  = BASE_CLUSTER_DIR + "Analyses/REL/"+intermediateHTML;

		
ModelTitle 			= "MG94x"+modelDesc[0];
rateBiasTerms 		= {{"AC","1","AT","CG","CT","GT"}};
paramCount	  		= 0;

AUTO_PARALLELIZE_OPTIMIZE = 3;

modelConstraintString = "";

for (customLoopCounter2=1; customLoopCounter2<6; customLoopCounter2=customLoopCounter2+1)
{
	for (customLoopCounter=0; customLoopCounter<customLoopCounter2; customLoopCounter=customLoopCounter+1)
	{
		if (modelDesc[customLoopCounter2]==modelDesc[customLoopCounter])
		{
			ModelTitle  = ModelTitle+modelDesc[customLoopCounter2];	
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
	if (customLoopCounter==customLoopCounter2)
	{
		ModelTitle = ModelTitle+modelDesc[customLoopCounter2];	
	}
}	
						
resp  			= 3;
resp2 			= 3;
correlationOn   = 0;

ExecuteAFile 	("discreteGenerator.bf");
ExecuteAFile 	("MG94xREV.mdl");

if (Abs(modelConstraintString))
{
	ExecuteCommands (modelConstraintString);
}


ExecuteCommands (nucModelString+"\nModel nucModel = (nucModelMatrix,overallFrequencies);");

populateTrees   ("nucTree", fileCount);
ExecuteCommands (constructLF ("nuc_lf", "nucData", "nucTree", fileCount));
Optimize 		(nuc_res, nuc_lf);

global 			codonFactor = 1;				

MULTIPLY_BY_FREQS = PopulateModelMatrix ("theRateMatrix", positionFrequencies);
vectorOfFrequencies = BuildCodonFrequencies (positionFrequencies);
			
Model MG94model = (theRateMatrix,vectorOfFrequencies,MULTIPLY_BY_FREQS);
populateTrees     ("givenTree", fileCount);

tNL = 0;
tCL = 0;

for (fileID = 1; fileID <= fileCount; fileID = fileID + 1)
{
	ExecuteCommands ("ClearConstraints (givenTree_" + fileID + ");");
	ExecuteCommands ("ReplicateConstraint (\"this1.?.synRate:=this2.?.t__/codonFactor\",givenTree_" + fileID + ",nucTree_" + fileID + ");");
	ExecuteCommands ("blL = BranchLength (nucTree_" + fileID + ",-1); clL = BranchLength (givenTree_" + fileID + ",-1);");
	tNL+= +blL;
	tCL+= +clL;
}

codonFactor = tCL/tNL;

AUTO_PARALLELIZE_OPTIMIZE = 3;

OPTIMIZATION_PRECISION       = 0.01;
OPTIMIZATION_TIME_HARD_LIMIT = 3600;

ExecuteCommands 		(constructLF ("lf", "filteredData", "givenTree", fileCount));
Optimize	    		(res,lf);

treeLengths = {fileCount,1};
for (fileID = 1; fileID <= fileCount; fileID = fileID + 1)
{
	ExecuteCommands ("clL = BranchLength (givenTree_" + fileID + ",-1);");
	treeLengths[fileID-1]	= +clL;
}



GetInformation	(dI,c);
GetInformation	(dI2,d);

				
ConstructCategoryMatrix(marginals,lf,COMPLETE);
GetString (lfInfo, lf, -1);
categVarIDs = lfInfo["Categories"];
//GetInformation (categVarIDs,lf);

customLoopCounter2 = resp*resp2;
if (categVarIDs[0]!="c")
{
    fprintf (stdout, "Inverted\n", categVarIDs, "\n");
	marginalsCorrected = marginals;
	for (h=0; h<Columns(marginals); h=h+1)
	{
		transition = 0;
		for (diff=0; diff<resp; diff += 1)
		{
			for (v=diff; v<customLoopCounter2; v += resp)
			{
				marginalsCorrected[transition][h] = marginals[v][h];
				transition += 1;
			}
		}
	}
	marginals = marginalsCorrected;
}



Export (lfOut, lf);
fprintf (finalPHP, CLEAR_FILE, _in_BayesFactor, "\n", nuc_res[1][0], "\n", res[1][0], "\n", treeMode, "\n", treeLengths, "\n",
				   dI, "\n", dI2, "\n", marginals, "\n", lfOut);


ratioVariable = {customLoopCounter2,3};

diff = 0;
for (h=0; h<resp; h=h+1)
{
	for (v=0; v<resp2; v=v+1)
	{
		ratioVariable[diff][0] = dI2[0][v]-dI[0][h];
		ratioVariable[diff][1] = dI2[1][v]*dI[1][h];
		ratioVariable[diff][2] = diff;
		diff = diff+1;
	}
}


priorPS		    = 0;
weightF2		= {1,customLoopCounter2};

for (h = 0; h<customLoopCounter2; h=h+1)
{
	if (ratioVariable[h][0] > 0)
	{
		priorPS = priorPS + ratioVariable[h][1];
		weightF2[h] = 1;
	}
}


if (priorPS > 0)
{
	priorPS = priorPS/(1-priorPS);
}

weightingFactors = Transpose(ratioVariable[-1][1]);
fprintf 		(stdout, ratioVariable, "\n", weightF2, "\n", priorPS,"\n",weightingFactors,"\n");


posSelected = 0;
negSelected = 0;


if (priorPS > 0)
{
	weightingFactors = Transpose(ratioVariable[-1][1]);
	for (h = 0; h < Columns (marginals); h=h+1)
	{
		normFactor = (weightingFactors*marginals[-1][h])[0];
		psFactor   = (weightingFactors$weightF2*marginals[-1][h])[0]/normFactor;
		fprintf      (stdout,h+1, " : ", psFactor, "\n");
		if (psFactor == 0)
		{
			negSelected = negSelected+1;
		}
		else
		{
			if (psFactor == 1)
			{
				posSelected = posSelected + 1;
			}
			else
			{
				postPS	   = psFactor/(1-psFactor);	
				if (postPS >= _in_BayesFactor)
				{
					posSelected = posSelected + 1;
				}
				else
				{
					if (postPS <= 1/_in_BayesFactor)
					{
						negSelected = negSelected + 1;
					}
				}
			}
		}
	}
}

fprintf				(intermediateHTML, CLEAR_FILE, "DONE");
GetString 			(HTML_OUT, TIME_STAMP, 1);
fprintf 			("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",ds_0.species,",",ds_0.sites/3,",",Time(1)-timer,",",_in_ModelDescription,",",posSelected,",",negSelected,",",_in_BayesFactor,"\n");


/*---------------------------------------------------------------------------------------------------------------------------------------------------*/

function BuildCodonFrequencies (obsF)
{
	PIStop = 1.0;
	result = {ModelMatrixDimension,1};
	hshift = 0;

	for (h=0; h<64; h=h+1)
	{
		first = h$16;
		second = h%16$4;
		third = h%4;
		if (_Genetic_Code[h]==10) 
		{
			hshift = hshift+1;
			PIStop = PIStop-obsF[first][0]*obsF[second][1]*obsF[third][2];
			continue; 
		}
		result[h-hshift][0]=obsF[first][0]*obsF[second][1]*obsF[third][2];
	}
	return result*(1.0/PIStop);
}

/*---------------------------------------------------------------------------------------------------------------------------------------------------*/
