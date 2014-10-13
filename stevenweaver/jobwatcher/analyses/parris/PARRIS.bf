timer = Time(1);

RequireVersion  ("0.9920060815");

fscanf  			(stdin,"String",_in_FilePath);
fscanf				(stdin,"Number", _in_GeneticCodeTable);
fscanf  			(stdin,"String",_in_ModelDescription);
fscanf  			(stdin,"String",_in_p_value);
fscanf  			(stdin,"Number",treeMode);

timer = Time(1);

AUTO_PARALLELIZE_OPTIMIZE = 3;

skipCodeSelectionStep    = 1;
ExecuteAFile			("../Shared/chooseGeneticCode.def");
ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");

ApplyGeneticCodeTable (_in_GeneticCodeTable);

modelDesc			= _in_ModelDescription;


GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath);
rootOn = "";

analysisSpecRaw     = _getRawTreeSplits (_in_FilePath, "treeMode", "rootOn");

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalPHP			= baseFilePath + ".out";

ExecuteAFile			("../Shared/_MFReader_.ibf");

if (fileCount > 1)
{
     AUTO_PARALLELIZE_OPTIMIZE = 0;
}

fprintf				(intermediateHTML, CLEAR_FILE);
		
ModelTitle 			= "MG94x"+modelDesc[0];
rateBiasTerms 		= {{"AC","1","AT","CG","CT","GT"}};
paramCount	  		= 0;

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
						

fprintf (intermediateHTML,
		"<DIV class = 'RepClassSM'><b>Phase 1</b> Fitting a nucleotide model (",ModelTitle,") to estimate relative branch lengths. \n");


ExecuteAFile 	("rateDefinitions.ibf");
ExecuteAFile 	("MG94xREV.mdl");

if (Abs(modelConstraintString))
{
	ExecuteCommands (modelConstraintString);
}


ExecuteCommands (nucModelString+"\nModel nucModel = (nucModelMatrix,overallFrequencies);");

populateTrees   ("nucTree", fileCount);
ExecuteCommands (constructLF ("nuc_lf", "nucData", "nucTree", fileCount));
Optimize 		(nuc_res, nuc_lf);

fprintf (intermediateHTML, "LogL = ",Format(nuc_res[1][0],10,3), "</DIV><DIV class = 'RepClassSM'><b>Phase 2</b> Fitting the M1 (null, no positive selection) model with 3 synonymous rate classes.\n");

global 			codonFactor = 1;				

defineAlpha	(0);
defineBeta  (0); /* start with the null */
MULTIPLY_BY_FREQS   = PopulateModelMatrix ("theRateMatrix", positionFrequencies);
vectorOfFrequencies = BuildCodonFrequencies (positionFrequencies);
			
Model MG94model = (theRateMatrix,vectorOfFrequencies,MULTIPLY_BY_FREQS);
populateTrees     ("givenTree", fileCount);

for (fileID = 1; fileID <= fileCount; fileID = fileID + 1)
{
	ExecuteCommands ("ClearConstraints (givenTree_" + fileID + ");");
	ExecuteCommands ("ReplicateConstraint (\"this1.?.synRate:=this2.?.t__/codonFactor\",givenTree_" + fileID + ",nucTree_" + fileID + ");");
	ExecuteCommands ("blL = BranchLength (nucTree_" + fileID + ",-1); clL = BranchLength (givenTree_" + fileID + ",-1);");
}


ExecuteCommands 		(constructLF ("lf", "filteredData", "givenTree", fileCount));
Optimize	    		(res_null,lf);

Export (lfOut, lf);
modelFile = finalPHP + ".null";
fprintf (modelFile, CLEAR_FILE, lfOut);

GetInformation		(cIN,c);
GetInformation		(dIN,d);

fprintf (intermediateHTML, "LogL = ",Format(res_null[1][0],10,3), "</DIV><DIV class = 'RepClassSM'><b>Phase 3</b> Fitting the M2 (alternative, positive selection) model with 3 synonymous rate classes.");

USE_LAST_RESULTS = 1;
defineBeta  (1);

MULTIPLY_BY_FREQS   = PopulateModelMatrix ("theRateMatrix", positionFrequencies);
vectorOfFrequencies = BuildCodonFrequencies (positionFrequencies);
			
Model MG94model = (theRateMatrix,vectorOfFrequencies,MULTIPLY_BY_FREQS);

for (fileID = 1; fileID <= fileCount; fileID = fileID + 1)
{
	ExecuteCommands ("ClearConstraints (givenTree_" + fileID + ");");
	ExecuteCommands ("ReplicateConstraint (\"this1.?.synRate:=this2.?.t__/codonFactor\",givenTree_" + fileID + ",nucTree_" + fileID + ");");
}

ExecuteCommands 		(constructLF ("lf", "filteredData", "givenTree", fileCount));
Optimize	    		(res_alt,lf);

Export (lfOut, lf);
modelFile = finalPHP + ".alt";
fprintf (modelFile, CLEAR_FILE, lfOut);

treeLengths = {fileCount,1};
for (fileID = 1; fileID <= fileCount; fileID = fileID + 1)
{
	ExecuteCommands ("clL = BranchLength (givenTree_" + fileID + ",-1);");
	treeLengths[fileID-1]	= (clL*(Transpose(clL)["1"]))[0];
}

fprintf (intermediateHTML, "LogL = ",Format(res_alt[1][0],10,3), "</DIV>");


GetInformation		(cIA,c);
GetInformation		(dIA,d);

myPV				= 1-CChi2(2(res_alt[1][0]-res_null[1][0]),2);

fprintf				(finalPHP, CLEAR_FILE, _in_p_value, "\n", treeMode, "\n", res_null[1][0],"\n", res_alt[1][0], "\n", treeLengths, "\n", cIN, "\n",dIN, "\n",cIA, "\n",dIA);

fprintf				(intermediateHTML, CLEAR_FILE, "DONE");
GetString 			(HTML_OUT, TIME_STAMP, 1);
fprintf 			("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",ds_0.species,",",ds_0.sites/3,",",Time(1)-timer,",",_in_ModelDescription,",",myPV,"\n");


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
