/* 

INPUT:

	file descriptor 		: upload.numbers.1
	gencodeid				: >=0 for a genetic code, -1 for nucleotides, -2 for protein
	model description		: six string (nucleotides) or a string descriptor (see Shared/ProteinModels/modellist.ibf)
	protein freq choice     : 0 (model frequencies) or 1 (+F option); for protein models only
	rvChoice				: 0 - constant rates, 1 - GDD, 2 - Beta/Gamma
	rateClasses				: for rvChoice > 1 determines how many rate classes the rate distribution should have
	treeMode				: the trees used for analysis
	outgroup				: the name of the taxon to be used as outgroup (to root on)
	
OUTPUT:
	ERROR: anyting 
		ASR run failed with the stated problem
		
	[NUMBER]: run time (seconds)
	[NMATRIX]: filter sizes 
	[NUMBER]: tree mode
	[STRING]: rooted on
	[STRING]: model description
	[NUMBER]: rvChoice
	[NUMBER]: rateClasses
	[NUMBER]: baseline logL for the model
	[MATRIX]: alphabet characters
	[MATRIX]: substitution matrix (scaled to one substitution per site)
	if (rvChoice>0)
		[MATRIX] rate distribution information
	[NUMBER]: the number of segments (S)
	[STRING]: consensus tree
	[MATRIX]: an N x S matrix, where each row corresponds to an internal node in the consensus tree
			  and each column maps it to the respective internal node in each of the segment tree
	
	for each segment
		[STRING]: fully annotated tree string for the block
		[MATRIX]: node index->node name
		[NMATRIX]:
			row -> site/node
			column lists:
				0: node index (post-order traversal) 
				1: site index (0 based; within partition)
				2: the index of the most likely (joint) residue
				3: the index of the most likely (marginal) residue
				4: the index of the most likely (sampled) residue
				[one/character]: marginal probability
			    [one/character]: sampled probability
				 
		
	[TEXT]	: likelihood function fit
		
*/	

ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile			("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile			("../Shared/globals.ibf");

timer 					= Time(1);
VERBOSITY_LEVEL 		= -1;

modelType     			= 1;
branchLengths 			= 1;

	 
fscanf  			(stdin,"String",fileSpec);
fscanf				(stdin,"Number",genCodeID);
fscanf  			(stdin,"String",modelDesc);
fscanf				(stdin,"Number",protModelFChoice);
fscanf				(stdin,"Number",rvChoice);
fscanf				(stdin,"Number",rateClasses);
fscanf				(stdin,"Number",treeMode);
fscanf				(stdin,"String",outgroup);

if (rvChoice)
{
	rateClasses			= rateClasses$1;
	rateClasses			= Min (8, Max(2, rateClasses));
}


GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+fileSpec);
GetURL				(analysisSpecRaw, _getTreeLink (fileSpec,treeMode,outgroup));

dataType 			= (genCodeID==(-2));

baseFilePath  		= "spool/"+fileSpec;
progressFilePath	= baseFilePath + ".progress";
outputFilePath		= baseFilePath + ".out";
fprintf				(outputFilePath,   CLEAR_FILE, KEEP_OPEN);
fprintf				(progressFilePath, CLEAR_FILE, "<DIV class = 'RepClassSM'><b>ANCESTRAL STATE RECONSTRUCTION</b></DIV>");
							
reportModelString   		= _generateModelName (dataType, modelDesc,rvChoice,"modelDescString");
						
if (genCodeID>=0)
{
	skipCodeSelectionStep = 1;
	ExecuteAFile("../Shared/chooseGeneticCode.def");
	ApplyGeneticCodeTable (_in_GeneticCodeTable);
	reportModelString	= "MG94 (global) x " + reportModelString;

	fprintf				(progressFilePath, "<DIV class = 'RepClassSM'>Fitting the nucleotide model to approximate branch lengths and substitution rates.</DIV>");
}
else
{
	fprintf				(progressFilePath, "<DIV class = 'RepClassSM'>Performing a maximum likelihood model (", modelDescString, ") fit</DIV>");
}

ExecuteAFile				("../Shared/_MFReaderUniversal_.ibf");
consTree					= _obtainTreeConsensus (myTrees, fileCount);
leafIndexing				= {};



if (genCodeID >= 0)
{
	ExecuteAFile			("../Shared/LocalMGREV.bf");
}
ExecuteAFile 				("../Shared/SBP_GARD_model.bf");


ACCEPT_ROOTED_TREES			= 0;
populateTrees				("givenTree", fileCount);
Tree						CTree = consTree;
refNodeList 				 = _buildListOfNodeMaps("CTree", "leafIndexing");

consClades		= Abs(refNodeList);
nodeMapMatrix	= {consClades,fileCount+2}; 
nodeMapMatrix[0] = "";

mappedNodes		= Rows (refNodeList);

for (z = 0; z < consClades; z=z+1)
{
	nodeMapMatrix[z][0] = refNodeList[mappedNodes[z]];
	ExecuteCommands("lm = "+mappedNodes[z]);
	lms = ""; lms * 128;
	
	for (lc = 0; lc < Rows(lm); lc=lc+1)
	{
		if (lm[lc])
		{
			if (Abs(lms))
			{
				lms * ",";
			}
			lms * TipName(CTree, lc);
		}
	}
	
	lms * 0;
	nodeMapMatrix[z][1] = lms;
}

for (z = 1; z <= fileCount; z = z+1)
{
	localLeaves = _buildListOfNodeMaps("givenTree_" + z, "leafIndexing");
	for (k = 0; k < consClades; k=k+1)
	{
		nodeMapMatrix [k][z+1] = localLeaves[mappedNodes[k]];
	}
}



ExecuteCommands				(constructLF					("_lf_ID","filteredData","givenTree",fileCount));
Optimize					(res, _lf_ID);


if (genCodeID >= 0)
{
	fprintf				(progressFilePath, "<DIV class = 'RepClassSM'>Finished fitting the nucleotide model; fitting the codon model.</DIV>");
	defaultModelBuild	();
	populateTrees		("codonTree", fileCount);
	global				omega = 1;
	for (k = 1; k <= fileCount; k = k+1)
	{
		ExecuteCommands ("ReplicateConstraint(\"this1.?.nonSynRate:=omega*this2.?.synRate\",codonTree_" + k + ",codonTree_" + k + ");");
		ExecuteCommands ("global scaler_"+k+"=1;ReplicateConstraint(\"this1.?.synRate:=scaler_"+k+"*this2.?.t__\",codonTree_" + k + ",givenTree_" + k + ");");
	}
	ExecuteCommands				(constructLF					("_lf_ID","codonData","codonTree",fileCount));
	Optimize					(res, _lf_ID);
	fprintf						(progressFilePath, "<DIV class = 'RepClassSM'>Finished fitting the evolutionary model. log(L) = ", res[1][0], "</DIV>");
}
else
{
	fprintf				(progressFilePath, "<DIV class = 'RepClassSM'>Finished fitting the evolutionary model. log(L) = ", res[1][0], "</DIV>");
}



if (genCodeID >= 0)
{
	GetDataInfo					(_filterChars, codonData, "CHARACTERS");
}
else
{
	GetDataInfo					(_filterChars, filteredData, "CHARACTERS");
}

_characterDimension				 = Columns(_filterChars);
_utility_Vector1 			 = {1,_characterDimension}["1"];
_utility_Vector2 			 = {1,_characterDimension}["_MATRIX_ELEMENT_COLUMN_"];

matrixColumns				 = 2*_characterDimension + 5;
_samplingIterates		     = 100;

matrixStash					= {};
segmentNames				= {};

for (partNumber = 0; partNumber < fileCount; partNumber = partNumber + 1)
{
	fprintf				(progressFilePath, "<DIV class = 'RepClassSM'>Reconstructing joint ancestors for segment ", partNumber+1, "</DIV>");
	partSpec 			= {{partNumber}};
	
	DataSet	 					mlAncestors = ReconstructAncestors (_lf_ID, partSpec);
	if (genCodeID >= 0)
	{
		DataSetFilter				_AncestalFilter	= CreateFilter (mlAncestors,3,,,GeneticCodeExclusions);
	}
	else
	{
		DataSetFilter				_AncestalFilter	= CreateFilter (mlAncestors,1);
	}
	GetDataInfo					   (_AncestalFilterChars,_AncestalFilter,"CHARACTERS");
	matrixRows				     = _AncestalFilter.species*_AncestalFilter.sites;
	_characterDimension 		 = Columns (_AncestalFilterChars);
	_sampledInformation			 = {};

	/* [(i,j)] -> {chars,1} - the frequency of each sampled character */
		
	GetString   (_AncestralNodeNames, _AncestalFilter, -1);
	GetDataInfo (_AncestalFilterSiteToPatternMap, _AncestalFilter);
	
	GetString	(ancNames,_AncestalFilter,-1);
	
	segmentNames[partNumber] = ancNames;
	segmentMatrix 	=  {matrixRows, matrixColumns};
	
	_idx_3 = 0;
	
	for (_idx_1 = 0; _idx_1 < _AncestalFilter.species; _idx_1 = _idx_1 + 1)
	{
		for (_idx_2 = 0; _idx_2 < _AncestalFilter.sites; _idx_2 = _idx_2 + 1)
		{
			segmentMatrix [_idx_3][0] = _idx_1;
			segmentMatrix [_idx_3][1] = _idx_2;
			
			GetDataInfo 	 (_charInfo, _AncestalFilter, _idx_1, _AncestalFilterSiteToPatternMap[_idx_2]);
			
			_whichChar = (_utility_Vector1*_charInfo)[0];
			if (_whichChar > 1)
			{
				segmentMatrix [_idx_3][2] = -1;
			}
			else
			{
				segmentMatrix [_idx_3][2] = (_utility_Vector2*_charInfo)[0];
			}

			_sampledInformation[_idx_3] = {_characterDimension,1};
			_idx_3 = _idx_3+1;
		}
	
	}
	
	fprintf				(progressFilePath, "<DIV class = 'RepClassSM'>Sampling joint ancestors for segment ", partNumber+1, "</DIV>");
	for (k = 0; k < _samplingIterates; k = k + 1)
	{
		DataSet	 			_sampledSequences = SampleAncestors (_lf_ID,partSpec);
		if (genCodeID < 0)
		{
			DataSetFilter		_sampledFilter	  = CreateFilter (_sampledSequences,1);
		}
		else
		{
			DataSetFilter		_sampledFilter	  = CreateFilter (_sampledSequences,3,,,GeneticCodeExclusions);
		
		}
		_idx_3 								  = 0;
		
		GetDataInfo (_sampledFilterSiteToPatternMap, _sampledFilter);
		for (_idx_1 = 0; _idx_1 < _sampledFilter.species; _idx_1 = _idx_1 + 1)
		{
			for (_idx_2 = 0; _idx_2 < _sampledFilter.sites; _idx_2 = _idx_2 + 1)
			{
				GetDataInfo 			 	  (_charInfo, _sampledFilter, _idx_1, _sampledFilterSiteToPatternMap[_idx_2]);
				_sampledInformation[_idx_3] = _sampledInformation[_idx_3]+_charInfo;
				_idx_3 = _idx_3+1;
			}
		}
	}
	
	_idx_3 								  = 0;
	offset_index						  = 5 + _characterDimension;
	
	for (_idx_1 = 0; _idx_1 < _sampledFilter.species; _idx_1 = _idx_1 + 1)
	{
		for (_idx_2 = 0; _idx_2 < _sampledFilter.sites; _idx_2 = _idx_2 + 1)
		{
			mx  = 0;
			mxi = 0;
			_marginalInformation = _sampledInformation[_idx_3];
			_marginalInformation = _marginalInformation*(1/(_utility_Vector1*_marginalInformation)[0]);
			for (_idx_4 = 0; _idx_4 < _characterDimension; _idx_4 = _idx_4 + 1)
			{
				v = _marginalInformation[_idx_4];
				if (v>mx)
				{
					mx  = v;
					mxi = _idx_4;
				}
				segmentMatrix [_idx_3][offset_index+_idx_4] = v;
			}
			segmentMatrix [_idx_3][4] = mxi;
			_idx_3 = _idx_3+1;
		}
	}
	
	
	fprintf				(progressFilePath, "<DIV class = 'RepClassSM'>Reconstructing marginal ancestors for segment ", partNumber+1, "</DIV>");
	DataSet	 		_marginalAncestors 			= ReconstructAncestors (_lf_ID,partSpec,MARGINAL);
	if (genCodeID < 0)
	{
		DataSetFilter		_marginalAncestorsFilter	  = CreateFilter (_marginalAncestors,1);
		ExecuteCommands ("GetDataInfo 	(_marginalFilterSiteToPatternMap, filteredData_" + (1+partNumber) +");");
	}
	else 
	{
		DataSetFilter		_marginalAncestorsFilter	  = CreateFilter (_marginalAncestors,3,,,GeneticCodeExclusions);
		ExecuteCommands ("GetDataInfo 	(_marginalFilterSiteToPatternMap, codonData_" + (1+partNumber) +");");
	
	}
	
	
	_idx_3 								  = 0;
	offset_index						  = 5;
	for (_idx_1 = 0; _idx_1 < _marginalAncestorsFilter.species; _idx_1 = _idx_1 + 1)
	{
		for (_idx_2 = 0; _idx_2 < _marginalAncestorsFilter.sites; _idx_2 = _idx_2 + 1)
		{
			_patternIndex 				 = _marginalFilterSiteToPatternMap[_idx_2];
			_marginalInformation		 = _marginalAncestors.marginal_support_matrix[{{_idx_1,_patternIndex*_characterDimension}}][{{_idx_1,(1+_patternIndex)*_characterDimension-1}}];
			_marginalInformation 		 = _marginalInformation*(1/(_utility_Vector1*_marginalInformation)[0]);
			mx  = 0;
			mxi = 0;
			for (_idx_4 = 0; _idx_4 < _characterDimension; _idx_4 = _idx_4 + 1)
			{
				v = _marginalInformation[_idx_4];
				if (v>mx)
				{
					mx  = v;
					mxi = _idx_4;
				}
				segmentMatrix [_idx_3][offset_index+_idx_4] = v;
			}
			segmentMatrix [_idx_3][3] = mxi;
			_idx_3 						 = _idx_3+1;
		}
	
	}
	matrixStash[partNumber] = segmentMatrix;
}

fprintf (outputFilePath, Time(1)-timer, "\n", _filterSizes, "\n", treeMode, "\n", outgroup, "\n", reportModelString, "\n", rvChoice, "\n", rateClass, "\n", res[1][0], "\n");
if (genCodeID >= 0)
{
	_reportSubstitutionMatrix ("codonTree_1","codonData");
}
else
{
	_reportSubstitutionMatrix ("givenTree_1","filteredData");
}
fprintf (outputFilePath, fileCount, "\n", consTree, "\n", nodeMapMatrix);

for (partNumber = 0; partNumber < fileCount; partNumber = partNumber+1)
{
	if (genCodeID >= 0)
	{
		ExecuteCommands ("tS = Format(codonTree_" + (1+partNumber) + ",1,1);");
	}
	else
	{
		ExecuteCommands ("tS = Format(givenTree_" + (1+partNumber) + ",1,1);");
	}
	fprintf (outputFilePath, "\n", tS, "\n", segmentNames[partNumber], "\n", matrixStash[partNumber]);
}

LIKELIHOOD_FUNCTION_OUTPUT = 7;

fprintf (outputFilePath, _lf_ID, CLOSE_FILE);
fprintf (progressFilePath, CLEAR_FILE, "DONE");
GetString (HTML_OUT, TIME_STAMP, 1);
fprintf   ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",filteredData.species,",",filteredData.sites,",",Time(1)-startTimer,",",reportModelName,",",rvChoice,",",rateClasses,"\n");

/*------------------------------------------------------------------------------------------*/
	
function _obtainTreeConsensus (treematrix, treecount)
{
	ExecuteCommands ("Topology cons_tree = " + treematrix[0]);
	
	for (k = 1; k < treecount; k=k+1)
	{
		ExecuteCommands ("Topology T = " + treematrix[k]);
		ct = cons_tree * T;
		ExecuteCommands ("Topology cons_tree = " + ct["CONSENSUS"]);
	}
	return Format(cons_tree,1,0);
}

/*------------------------------------------------------------------------------------------*/
	
function _buildListOfNodeMaps (treeID, leafMap&)
{
	ExecuteCommands ("topAVL = " + treeID + "^0;leafCount = TipCount(" + treeID + ")");
	_nodeMap = {};
	doPop	 = Abs(leafMap) == 0;
	
	for (k = 1; k < Abs (topAVL)-1; k = k+1)
	{
		myParent 	 = (topAVL[k])["Parent"];
		isInternal   = Abs ((topAVL[k])["Children"]);
		
		if (myParent > 0)
		{
			if (Abs (_nodeMap[(topAVL[myParent])["Name"]]) == 0)
			{
				_nodeMap[(topAVL[myParent])["Name"]] = {leafCount,1};
			}
		}
		
		if (!isInternal)
		{
			if (doPop)
			{
				nodeIndex = Abs(leafMap);
				leafMap    [(topAVL[k])["Name"]] = nodeIndex;
			}
			else
			{
				nodeIndex = leafMap    [(topAVL[k])["Name"]];
			}
			(_nodeMap[(topAVL[myParent])["Name"]])[nodeIndex] = 1;
		}
		else
		{
			_nodeMap[(topAVL[myParent])["Name"]] = _nodeMap[(topAVL[myParent])["Name"]] + (_nodeMap[(topAVL[k])["Name"]]);
		}
		
		
	}
	
	_byChildrenMap = {};
	keys = Rows (_nodeMap);
	for (k = 0; k < Abs(_nodeMap); k = k + 1)
	{
		_byChildrenMap[_nodeMap[keys[k]]] = keys[k];
	}
	return _byChildrenMap;
}
