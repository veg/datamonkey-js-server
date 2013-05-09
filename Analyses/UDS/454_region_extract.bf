ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"GrabBag.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DescriptiveStatistics.bf");
ExecuteAFile					("../Shared/nucleotide_options.def");
ExecuteAFile					("../Shared/ReadDelimitedFiles.bf" );

AALetters						= "ACDEFGHIKLMNPQRSTVWY?-";
NucLetters						= "ACGT-N";
AAMap							= {};
for (k = 0; k < Abs (AALetters); k=k+1)
{
	AAMap[AALetters[k]] = k;
}

alignOptionsIn = {};

SetDialogPrompt 		("454 run database file:");
ANALYSIS_DB_ID			= _openCacheDB ("");

DB_FILE_PATH 			= LAST_FILE_PATH;

fscanf ( stdin, "Number", geneticCodeTable );

ChoiceList	(whichTable,"Which table?", 1, SKIP_NONE, "Protein", "In-frame protein based reference", "Nucleotide", "Filtered nucleotide sequences");

if (whichTable < 0)
{
	return 0;
}

if (whichTable)
{
	tableName				= "NUC_ALIGNMENT";
}
else
{
	tableName				= "AA_ALIGNMENT";
}

haveTable				= _TableExists (ANALYSIS_DB_ID, tableName);

if (haveTable)
{
	max_position   = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT MAX(POSITION) AS MX FROM " + tableName);
	max_position   = 0+(max_position[0])["MX"];
	
	ChoiceList	(filteringMethod,"Use query sequence?", 1, SKIP_NONE, "Yes", "Provide a sequence to determine coordinate range from", "No", "Input sequence coordinates directly");
	
	if (filteringMethod == 1)
	{
		
		
		fromP 		   = prompt_for_a_value 		  ("Starting position?",1,1,max_position-1,1);
		toP 		   = prompt_for_a_value 		  ("Ending position?",1,fromP+1,max_position,1);
		
	}
	else
	{
		fprintf (stdout, "Filtering string: ");
		fscanf  (stdin,  "String", filterString);
		filterString = (filterString&&1)^{{"[^A-Z]"}{""}};
		if (whichTable == 1)
		{
			refStr		= ((_ExecuteSQL (ANALYSIS_DB_ID,"SELECT REFERENCE_PASS2 FROM SETTINGS"))[0])["REFERENCE_PASS2"];
		}
		else
		{
			settings 		= (_ExecuteSQL (ANALYSIS_DB_ID,"SELECT * FROM SETTINGS"))[0];
			ExecuteCommands ("_Genetic_Code = " + settings["GENETIC_CODE"]);
			ExecuteCommands (settings["OPTIONS"] ^ {{"_hyphyAssociativeArray","alignOptionsIn_p2"}});
			codonToAAMap = makeAAMap();
			refStr		=  translateToAA(settings["REFERENCE"],0);
			
		}
		if (Abs (filterString))
		{
			inStr 		= {{refStr,filterString}};
			AlignSequences(aligned, inStr, alignOptionsIn_p2);
			aligned	   = aligned[0];
			offsets    = computeCorrection (aligned[2]);
			offsets[1] = Abs(aligned[2])-offsets[1]-1;
			
			fromP = offsets[0] + 1;
			toP = offsets[0] + Abs(((aligned[1])[offsets[0]][offsets[1]])^{{"[^A-Z]",""}});
			fprintf (stdout, "\nUsing sequence determined range of ", fromP, " to ", toP, "\n");		
		}
		else
		{
			fprintf (stdout, "ERROR: please feed me a meaningful string... [non empty, with letters in it]\n");
			return 0;
		}
		
	}
	
	if (whichTable)
	{
		rawSQL			  = "SELECT OFFSET, NUC_PASS2,REF_PASS2,OFFSET_PASS2 FROM SEQUENCES,SETTINGS WHERE OFFSET_PASS2 <= " + fromP + " AND SPAN_PASS2+OFFSET_PASS2 > " + toP;
	}	
	else
	{
		rawSQL			  = "SELECT OFFSET, ALIGNED_AA,ALIGNED_AA_REF,ALIGNED FROM SEQUENCES,SETTINGS WHERE OFFSET <= " + fromP + " AND SPAN+OFFSET > " + toP*3 + " AND SCORE>THRESHOLD";
	}
	
	matchingSequences =  _ExecuteSQL (ANALYSIS_DB_ID, rawSQL);
	
	binner       = {};
	codon_binner = {};
	variantCount	   = Abs (matchingSequences);
	
	for (k = 0; k<variantCount; k=k+1)
	{
		if (whichTable)
		{
			qStr = (matchingSequences[k])["NUC_PASS2"];
			rStr = (matchingSequences[k])["REF_PASS2"];		
			span = extractRegionBasedOnReference (rStr, fromP, toP, 0+(matchingSequences[k])["OFFSET_PASS2"]);
		}
		else
		{
			qStr = (matchingSequences[k])["ALIGNED_AA"];
			rStr = (matchingSequences[k])["ALIGNED_AA_REF"];
			cStr = (matchingSequences[k])["ALIGNED"];
			span = extractRegionBasedOnReference (rStr, fromP, toP, 1+(0+(matchingSequences[k])["OFFSET"])$3);
		}
		
		cStr2 = qStr[span[0]][span[1]];
		binner [cStr2] = binner[cStr2] + 1;
		/*isgaps 	= (cStr2 $ "^\\-+$")[0]>=0;
		if (isgaps)
		{
			fprintf (stdout, ">ref\n",rStr, "\n>qry\n", qStr, "\n\n");
		}*/
		if (whichTable == 0)
		{
			cStr2 				= cStr[3*span[0]][3*span[1]+2];
			codon_binner [cStr2] = codon_binner [cStr2] + 1;
		}
	}
	if (whichTable == 0)
	{
		binner = codon_binner;
	}
	
	totalVariants	   = Abs (binner);
	fprintf			   (stdout, "Found ", totalVariants, " variants among ", variantCount, " sequences\n");
	ChoiceList			(variantMethod,"Filter low frequency variants method", 1, SKIP_NONE, "Proportion", "Keep sequences representing a fixed proportion of the sample or greater", 
										   "Counts", "Keep sequences representing with a minimum number of copies");


	if (variantMethod)
	{
		threshold 		   = prompt_for_a_value 		  ("Gate sequence variants at this copy number?",0,0,variantCount,1);
	}
	else
	{
		threshold 		   = prompt_for_a_value 		  ("Gate sequence variants at this threshold?",0.01,0,1,0);
		threshold		   = (variantCount*threshold+0.5)$1;
	
	}
	
	retained		   = {};
	threshold		   = Max(threshold, minCopyCount);
	fprintf			     (stdout, "Excluding all variants with fewer than ", threshold, " copies\n");
	retained		   = {};
	variants		   = Rows (binner);
	
	fprintf ( stdout, variants, "\n" );
	
	for (k = 0; k < totalVariants; k = k+1)
	{
		seq = variants[k];
		if (binner[seq] >= threshold )
		{
			retained [k] = binner[seq];
		}
	}
	retainedVariants = Abs (retained);
	
	if (retainedVariants == 0)
	{
		fprintf ( stdout, "No variants retained!" );
		return 0;
	}
	
	retainedIndices	 = Rows (retained);
	toSort = {retainedVariants,2};
	for (k = 0; k < retainedVariants; k=k+1)
	{
		toSort [k][0] = 0+retainedIndices[k];
		toSort [k][1] = retained[retainedIndices[k]];
	}
	toSort = toSort%1;
	
	
	ChoiceList		(clones,"Include clonal sequences?", 1, SKIP_NONE, "Yes", "Include existing clones", "No", "Do not include clonal sequences");
	if (clones == 0)
	{
		SetDialogPrompt ("Read clones from:");
		/*
		fscanf (PROMPT_FOR_FILE, "Raw", cloneSeqs);
		*/
		DataSet 		cloneDS 	= ReadDataFile (PROMPT_FOR_FILE);
		DataSetFilter 	cloneDSF 	= CreateFilter (cloneDS,1);
	
		cloneCount 	= cloneDSF.species;
		
		retainedIndices = {"0":0};
		retainedCounts  = {"0":1};

		for (k = 1; k < cloneDSF.species; k = k + 1) {
			for (seqID = 0; seqID < Abs(retainedIndices); seqID = seqID+1) {
				GetDataInfo (diff, cloneDSF, retainedIndices[seqID], k, RESOLVE_AMBIGUITIES);
				diff = Max(diff["_MATRIX_ELEMENT_VALUE_*(_MATRIX_ELEMENT_ROW_!=_MATRIX_ELEMENT_COLUMN_)"],0);
				if (diff == 0) {
					retainedCounts [seqID] = retainedCounts[seqID] + 1;
					break;
				}
			}
			if (seqID == Abs(retainedIndices)) {
				retainedIndices[Abs(retainedIndices)] = k;
				retainedCounts[Abs(retainedCounts)] = 1;
			}
		}
	}

	fprintf 		(stdout, "Retained ", retainedVariants, " variants\n\n");
	SetDialogPrompt ("Save filtered variants to:");

	fprintf (PROMPT_FOR_FILE, CLEAR_FILE, KEEP_OPEN);
	
	for (k = retainedVariants-1; k>=0; k=k-1)
	{
		fprintf (LAST_FILE_PATH, ">variant_",(retainedVariants-k),"_",toSort[k][1],"_copies\n", variants[toSort[k][0]], "\n");			     
	}

	if (clones == 0) {
		for (k = 0; k < Abs(retainedIndices); k += 1) {
			GetDataInfo (seqStr, cloneDSF, retainedIndices[k]);
			fprintf (LAST_FILE_PATH, ">clone_",k,"_",retainedCounts[k],"_copies\n", seqStr,"\n");
		}
	}

	fprintf (LAST_FILE_PATH,CLOSE_FILE);
	inFile = LAST_FILE_PATH;
		
	/*check for frameshift errors and assign reference sequences */
	ApplyGeneticCodeTable (geneticCodeTable);
	codonToAAMap = makeAAMap();
	DataSet testDS = ReadDataFile ( inFile );
	DataSetFilter testFilter = CreateFilter ( testDS, 1 );
	GetInformation (testSequences,testFilter );
	GetString ( testNames,testFilter,-1);

	seqLengthNameAVL = {};
	seqLengthArray = { Columns ( testSequences ), 2 };

	testlongestSequence = 0;
	for ( ts = 0; ts < Columns ( testSequences ); ts = ts + 1 ) {

		testSequences[ts] = ((testSequences[ts]^{{"[^a-zA-Z]",""}})^{{"^N+",""}})^{{"N+$",""}};

		if ( Abs ( testSequences[ts] ) > testlongestSequence ) {
			testlongestSequence = Abs ( testSequences[ts] );
			testlongestSequenceIDX = ts;
		}
	
		seqLengthArray[ts][0] = ts;
		seqLengthArray[ts][1] = Abs ( testSequences[ts]);
	
		seqLengthNameAVL[ts]	= {};
	
		(seqLengthNameAVL[ts])["NAME"] = testNames [ ts ];
		(seqLengthNameAVL[ts])["LENGTH"] =  Abs ( testSequences[ts] );
	
		aSeq = testSequences[ts];
		seqLen = Abs(aSeq)-2;
	
		minStops = 1e20;
		tString  = "";
		rFrame   = 0;
	
		stopPosn = {3,2};
		allTran  = {3,1};
	
		for (offset = 0; offset < 3; offset += 1) {
			translString = translateCodonToAA (aSeq, codonToAAMap, offset);
			stopPos = translString||"X";
			if (stopPos[0]>=0) {
				stopCount = Rows(stopPos)$2;
				stopPosn[offset][0] = stopPos[0];
				stopPosn[offset][1] = stopPos[stopCount*2-1];
			}
			else {
				stopCount = 0;
			}
			if (stopCount<minStops) {	
				minStops = stopCount;
				rFrame   = offset;
				tString  = translString;
			}
			allTran[offset] = translString;
		}
		if (minStops>0) {
			(seqLengthNameAVL[ts])["FS"] = 1;
		} else {
			(seqLengthNameAVL[ts])["FS"] = 0;
		}
	}

	seqLengthArray = (seqLengthArray % 1);

	gotReference = 0;
	checkFS = 0 + (seqLengthNameAVL[testlongestSequenceIDX])["FS"];
	if ( checkFS ) {
		seq_idx = Rows ( seqLengthArray ) - 2;
		while ( seq_idx >= 0 ) {
			real_idx = seqLengthArray[seq_idx][0];
			checkFS = 0 + (seqLengthNameAVL[real_idx])["FS"];
			if ( !checkFS ) {
				gotReference = 1;
				break;
			}
			else {
				seq_idx = seq_idx - 1;
			}
		}
		refName = testNames[seqLengthArray[seq_idx][0]];
		refSeq = testSequences[seqLengthArray[seq_idx][0]];
	}
	else {
		refName = testNames[testlongestSequenceIDX];
		refSeq = testSequences[testlongestSequenceIDX];
		gotReference = 1;
	}

	if ( gotReference ) {
		/*rewrite infile with reference sequence as first in file*/
		fprintf ( stdout, "rewriting ", inFile, "\n" );
		fprintf ( inFile, CLEAR_FILE, ">", refName, "\n", refSeq, "\n" );
		for ( k = 0; k < Columns ( testSequences ); k = k + 1 ) {
			if ( testNames [ k ] != refName ) {
				fprintf ( inFile, ">", testNames[k], "\n", testSequences[k], "\n" );
			}
		}
		alignOptions2 = {};
		alignOptions2["0"] = aaScoreString;
		alignOptions2["1"] = "No penalty";
		alignOptions2["2"] = "First in file";
		alignOptions2["3"] = "No";
		alignOptions2["4"] = inFile;
		alignOptions2["5"] = "No";
		alignOptions2["6"] = "No";
		alignOptions2["7"] = inFile;
		ExecuteAFile ("../Shared/SeqAlignment.bf", alignOptions2);
		WARN_NUC_ALIGN = 0;
	}
	else {
		/*do nuc alignment if we can't find non-frameshift reference variants */
		alignOptions = {};
		alignOptions ["0"] = "No penalty";
		alignOptions ["1"] = "First in file";
		alignOptions ["2"] = "No";
		alignOptions ["3"] = inFile;
		alignOptions ["4"] = "No";
		alignOptions ["5"] = inFile;
		ExecuteAFile ("../Shared/SeqAlignmentNuc.bf", alignOptions);	
		WARN_NUC_ALIGN = 1;
	}

	if ( !WARN_NUC_ALIGN ) {
		tempFile = "";
		tempFile = inFile + ".nuc";
		fscanf ( tempFile, "Raw", fileStringRaw );
		fprintf ( inFile, CLEAR_FILE, fileStringRaw );
	}
	
	DataSet checkVariants = ReadDataFile (inFile);
	retainedVariants = checkVariants.species;
	
	if ( clones == 0 || retainedVariants > 3 ) { /*added by WD to prevent NJ etc when there are only 2 variants */
		
		if (clones == 0)
		{
			DataSet 		cloneDS 	= ReadDataFile (inFile);
			DataSetFilter 	cloneDSF 	= CreateFilter (cloneDS,1);
			
			retainedIndices = {"0":retainedVariants};
			retainedCounts2 = {"0":retainedCounts[0]};
			
			
			for (k = retainedVariants+1; k < cloneDSF.species; k = k + 1)
			{
				for (seqID = 0; seqID < Abs(retainedIndices); seqID = seqID+1)
				{
					GetDataInfo (diff, cloneDSF, retainedIndices[seqID], k, RESOLVE_AMBIGUITIES);
					diff = Max(diff["_MATRIX_ELEMENT_VALUE_*(_MATRIX_ELEMENT_ROW_!=_MATRIX_ELEMENT_COLUMN_)"],0);
					if (diff == 0)
					{
						retainedCounts2 [seqID] = retainedCounts2[seqID] + retainedCounts[k-retainedVariants];
						break;
					}
				}
				if (seqID == Abs(retainedIndices))
				{
					retainedIndices[Abs(retainedIndices)] = k;
					retainedCounts2[Abs(retainedCounts2)] = retainedCounts[k-retainedVariants];
				}
			}
			
			fprintf (inFile, CLEAR_FILE);
			
			for (k = 0; k < retainedVariants; k = k + 1)
			{
				GetString   (seqName, cloneDSF, k);
				GetDataInfo (seqStr, cloneDSF, k);
				fprintf (inFile, ">",seqName,"\n", seqStr,"\n");
			}
			
			for (k = 0; k < Abs(retainedIndices); k = k + 1)
			{
				GetDataInfo (seqStr, cloneDSF, retainedIndices[k]);
				fprintf (inFile, ">clone_",k,"_",retainedCounts2[k],"_copies\n", seqStr,"\n");
			}
		}
		
		
		alignOptionsIn = {};
		alignOptionsIn ["0"] = "Distance formulae";
		alignOptionsIn ["1"] = "Nucleotide/Protein";
		alignOptionsIn ["2"] = inFile;
		alignOptionsIn ["3"] = "Force Zero";
		alignOptionsIn ["4"] = "TN93";
		alignOptionsIn ["5"] = "y";
		alignOptionsIn ["6"] = inFile+".tree";
		
		
		ExecuteAFile (HYPHY_LIB_DIRECTORY + "TemplateBatchFiles" + DIRECTORY_SEPARATOR + "NeighborJoining.bf", alignOptionsIn);	
		
		alignOptionsIn ["0"] = "Proportions";
		alignOptionsIn ["1"] = "90";
		alignOptionsIn ["2"] = "/dev/null";
		
		ExecuteCommands ("BootStrapFunction(100,\"/dev/null\", 1)", alignOptionsIn); 
		
		alignOptionsIn = {};
		alignOptionsIn ["0"] = inFile;
		alignOptionsIn ["1"] = "HKY85";
		alignOptionsIn ["2"] = "Global";
		alignOptionsIn ["3"] = inFile+".tree";
		
		ExecuteAFile (HYPHY_LIB_DIRECTORY + "TemplateBatchFiles" + DIRECTORY_SEPARATOR + "AnalyzeNucProtData.bf", alignOptionsIn);	
		
		TREE_OUTPUT_OPTIONS     = {};
		TREE_OUTPUT_OPTIONS		["TREE_OUTPUT_LAYOUT"] 			= 0;
		TREE_OUTPUT_OPTIONS		["TREE_OUTPUT_XTRA_MARGIN"] 	= 10;
		TREE_OUTPUT_OPTIONS 	["TREE_OUTPUT_SYMBOLS"] 		= 1;
		TREE_OUTPUT_OPTIONS 	["TREE_OUTPUT_SYMBOL_SIZE"] 	= symsize;
		TREE_OUTPUT_OPTIONS 	["__FONT_SIZE__"] 				= 24;
		
		UseModel (USE_NO_MODEL);
		
		GetString (mostAb, filteredData, 0);
		
		saveBST   = Format(Bootstrap_Tree,1,1);
		rerootBST = RerootTree (Format(Bootstrap_Tree,1,1),0);
		
		Tree Bootstrap_Tree = rerootBST;
		
		rerootGTS = RerootTree (givenTree, mostAb);
		rerootBTS = RerootTree (Bootstrap_Tree, mostAb);
				
		Tree Bootstrap_Tree = rerootBTS;
		Tree givenTree		= rerootGTS;
		
		allBN = givenTree^0;
		bsBL  = Bootstrap_Tree^0;
		
		countVariants = 0;
		for ( _s = 0; _s < Abs ( allBN ); _s += 1 ) {
			if (Abs((allBN[k])["Children"]) == 0)
			{
				split454 = splitOnRegExp ( (allBN[_s])["Name"], "_" );
				countVariants += split454[2];
			}
		}
		
				
		for (k = 1; k < Abs(allBN); k=k+1)
		{
			bn = (allBN[k])["Name"];
			
			TREE_OUTPUT_OPTIONS[bn] = {};
			
			if (Abs((allBN[k])["Children"]) == 0)
			{
				is454 = (bn$"^variant\\_[0-9]+\\_([0-9]+)");
				if (is454[0] < 0)
				{
					is454 = (bn$"^clone\\_[0-9]+\\_([0-9]+)");
					prop = (0+bn[is454[2]][is454[3]])/cloneCount;
					diamMult = 1.5*Max(Sqrt(prop),0.2);
					(TREE_OUTPUT_OPTIONS[bn])["TREE_OUTPUT_BRANCH_LABEL"] = "0.2 0.2 0.8 setrgbcolor currentpoint exch 1 add exch __FONT_SIZE__ " + diamMult + " mul 2 div sub __FONT_SIZE__ " + diamMult + " mul dup rectfill 0 0 0 setrgbcolor __FONT_SIZE__  "+ diamMult +" 0.2 add mul 0 __FONT_SIZE__ 3 div sub rmoveto (" + Format(prop*100,3,1) + "%) show";
				}
				else
				{
					prop = (0+bn[is454[2]][is454[3]])/countVariants;
					diamMult = 1.5*Max(Sqrt(prop),0.2);
					(TREE_OUTPUT_OPTIONS[bn])["TREE_OUTPUT_BRANCH_LABEL"] = "/nodearc {exch __FONT_SIZE__ " + diamMult + " mul 2 div add exch __FONT_SIZE__ 2 idiv " + diamMult + " mul  0 360 arc} def\n0.8 0.2 0.2 setrgbcolor currentpoint exch 1 add exch currentpoint exch 1 add exch nodearc fill 0 0 0 setrgbcolor exch __FONT_SIZE__ "+ diamMult +" 0.2 add mul add exch __FONT_SIZE__ 3 div sub moveto (" + Format(prop*100,3,1) + "%) show";
				}
			}
			else
			{
				if ((bsBL[k])["Length"] > 0.90)
				{
					(TREE_OUTPUT_OPTIONS[bn])["TREE_OUTPUT_OVER_BRANCH"] = "(" + Format((bsBL[k])["Length"] * 100, 4, 1) + ") drawletter\n";
				}
			}
		}
		
		treeS = PSTreeString (givenTree,"EXPECTED_NUMBER_OF_SUBSTITUTIONS",{{300,(2+TipCount(givenTree))*TREE_OUTPUT_OPTIONS 	["__FONT_SIZE__"]}});
		treeFile = inFile+".ps";
		fprintf (treeFile,CLEAR_FILE,"/drawletter {2 4 rmoveto 1 copy false charpath pathbbox 2 index 3 sub sub exch 3 index 3 sub sub exch  0.85 setgray 4 copy rectfill 0 setgray  3 index 3 index currentlinewidth 0.5 setlinewidth 7 3 roll rectstroke setlinewidth exch 1.5 add exch 1.5 add moveto show} def\n", treeS);
		
	}
}
else
{
	fprintf (stdout, "ERROR: NO NUC_ALIGNMENT TABLE IN THIS FILE. PLEASE RERUN 454.bf ON THE .FNA FILE");
	return 0;	
}

_closeCacheDB			(ANALYSIS_DB_ID);

/*-------------------------------------------------*/

function extractAField (key, value)
{
	storageArray [Abs (storageArray)] = 0+value[FIELD_NAME];
	return 0;
}

/*-------------------------------------------------*/

function extractFrequencySpectrum (key, value)
{
	storageArray [Abs (storageArray)] = 0+value[FIELD_NAME];
	return 0;
}

/*-------------------------------------------------*/

function extractFrequencySpectrum ()
{
	max  = 0; ind  = 0;
	max2 = 0; ind2 = 0;
	cols = Columns (SQL_ROW_DATA);
	for (k = 0; k < cols; k=k+1)
	{
		v = 0 + SQL_ROW_DATA[k];
		if (v > max)
		{
			max2 = max; ind2 = ind;
			max = v;    ind = k;
		}
	}
	minorityResidues [Abs(minorityResidues)] = max2/max;
	majorityResidues [Abs(majorityResidues)] = max;
	return 0;
}

/*-------------------------------------------------*/

function printFrequencySpectrum (min_t)
{
	max  = 0; ind  = 0;
	max2 = 0; ind2 = 0;
	cols = Columns (SQL_ROW_DATA);
	for (k = 0; k < cols; k=k+1)
	{
		v = 0 + SQL_ROW_DATA[k];
		if (v > max)
		{
			max2 = max; ind2 = ind;
			max = v;    ind = k;
		}
	}
	/*
	max2/max;
	majorityResidues [Abs(majorityResidues)] = max;
	*/
	fprintf (stdout, idx_to_res[ind]);
	seq_maj * idx_to_res[ind];
	if (max2/max >= min_t)
	{
		fprintf (stdout, ":", idx_to_res[ind2], " (", max2/max*100,"%)");
		seq_min * idx_to_res[ind2];
	}
	else
	{
		seq_min * idx_to_res[ind];
	}
	fprintf (stdout, "\n");
	return 0;
}

/*-------------------------------------------------*/

function report_consensus (indel_rate)
{
	
	return 0;
}
