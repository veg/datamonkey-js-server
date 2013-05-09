ExecuteAFile	("../Shared/globals.ibf");
ExecuteAFile 	("../Shared/GrabBag.bf");
ExecuteAFile 	("../Shared/DBTools.ibf");
ExecuteAFile 	("../Shared/DescriptiveStatistics.bf");
ExecuteAFile 	("../Shared/nucleotide_options.def");
fscanf			("454_mpi_includes.ibf", "Raw", mpi_def_string );

if ( DO_PIPELINE ) {
	DataSet unal  = ReadFromString (dataFileString);
}
else {
	SetDialogPrompt ( "Provide a 454 quality filtered data file:" );
	DataSet unal = ReadDataFile (PROMPT_FOR_FILE);
	noPipeline_filePath = LAST_FILE_PATH;
}

if ( MPI_NODE_COUNT ) {
	MPINodeState = {MPI_NODE_COUNT-1,2};
	MPINodeInfo     = {MPI_NODE_COUNT-1,1};
	fprintf ( stdout, "Utilizing an MPI environment with ", MPI_NODE_COUNT, " nodes for 454 processing\n" );
}

if ( DO_PIPELINE ) {
	skipCodeSelectionStep = 1;
	ExecuteAFile	("../Shared/chooseGeneticCode.def");
	fscanf ( stdin, "Number", _local_GeneticCodeTable );
	ApplyGeneticCodeTable ( _local_GeneticCodeTable );
}
else {
	ExecuteAFile	("../Shared/chooseGeneticCode.def");
}

AALetters						= "ACDEFGHIKLMNPQRSTVWY?-";
NucLetters						= "ACGT-N";
AAMap							= {};

for (k = 0; k < Abs (AALetters); k=k+1)
{
	AAMap[AALetters[k]] = k;
}

alignOptions = {};

SetDialogPrompt ( "Provide a database file for storing results (if empty one will be created):" );
DoSQL           (SQL_OPEN, PROMPT_FOR_FILE, ANALYSIS_DB_ID);

fscanf ( stdin, "Number", refOption );
fscanf ( stdin, "String", dagene );

if ( refOption != 2 ) {
	fscanf ( stdin, "String", masterReferenceSequence );
}
else {
	doLongestSequence = 1;
}

haveTable				= _TableExists (ANALYSIS_DB_ID, "SETTINGS");

if (haveTable)
{
	existingSettings = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT * FROM SETTINGS");
}

tableDefines			   = {};
tableDefines  ["BASE_FREQUENCIES"] 					= {};
(tableDefines ["BASE_FREQUENCIES"])["MATRIX"] 		= "TEXT";


if (Abs(existingSettings))
{
	existingSettings = Eval("existingSettings [0]");
	
	_Genetic_Code    = Eval(existingSettings["GENETIC_CODE"]);
	alignOptions     = Eval(existingSettings["OPTIONS"]);
	
	masterReferenceSequence = existingSettings["REFERENCE"];
	
	dbSequences = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT SEQUENCE_ID FROM SEQUENCES WHERE STAGE = 0");
	
	unalSequenceCount = Abs(dbSequences);
	toDoSequences     = {unalSequenceCount,1};
	for (k = 0; k < unalSequenceCount; k+=1) {
		toDoSequences[k] = (dbSequences[k])["SEQUENCE_ID"];
	}
	dbSequences = 0;
	min_length  = 0 + existingSettings["MIN_LENGTH"];
}
else
{
	
	tableDefines  ["SETTINGS"] = {};
	(tableDefines ["SETTINGS"])["RUN_DATE"] 				= "DATE";
	(tableDefines ["SETTINGS"])["OPTIONS"] 				    = "TEXT";
	(tableDefines ["SETTINGS"])["MIN_LENGTH"] 				= "TEXT";
	(tableDefines ["SETTINGS"])["REFERENCE"] 				= "TEXT";
	(tableDefines ["SETTINGS"])["REFERENCE_PASS2"] 			= "TEXT";
	(tableDefines ["SETTINGS"])["GENETIC_CODE"] 			= "TEXT";
	(tableDefines ["SETTINGS"])["EXP_PER_BASE_SCORE"]		= "REAL";
	(tableDefines ["SETTINGS"])["THRESHOLD"]				= "REAL";
	(tableDefines ["SETTINGS"])["THRESHOLD_PASS2"]			= "REAL";
	
	(tableDefines ["SETTINGS"])["MIN_COVERAGE"]				= "INTEGER";
	(tableDefines ["SETTINGS"])["SW_SIZE"]					= "INTEGER";
	(tableDefines ["SETTINGS"])["SW_STRIDE"]				= "INTEGER";
	(tableDefines ["SETTINGS"])["MIN_COPIES"]				= "INTEGER";
	(tableDefines ["SETTINGS"])["DUAL_INFECTION_THRESHOLD"]	= "REAL";
	(tableDefines ["SETTINGS"])["STANFORD_SCORE"]			= "INTEGER";
	(tableDefines ["SETTINGS"])["MIN_DR_COVERAGE"]			= "INTEGER";
	
	tableDefines  ["SEQUENCES"] = {};
	(tableDefines ["SEQUENCES"])["SEQUENCE_ID"]				= "TEXT UNIQUE";
	(tableDefines ["SEQUENCES"])["LENGTH"] 				    = "INTEGER";
	(tableDefines ["SEQUENCES"])["STAGE"] 				    = "INTEGER"; 
	/*
	 0 - initial import
	 1 - in frame without a fix 
	 2 - nucleotide alignment accepted
	 3 - out-of-frame; not fixed / not aligned
	 4 - hopeless/discard
	 */
	(tableDefines ["SEQUENCES"])["RAW"]						= "TEXT";
	(tableDefines ["SEQUENCES"])["ALIGNED_AA"]				= "TEXT";    /* aligned aa. sequence */
	(tableDefines ["SEQUENCES"])["ALIGNED"]					= "TEXT";    /* aligned nucleotide sequence */
	(tableDefines ["SEQUENCES"])["ALIGNED_AA_REF"]			= "TEXT";    /* aligned nucleotide sequence */
	(tableDefines ["SEQUENCES"])["OFFSET"]					= "INTEGER"; /* start offset w.r.t the reference sequence */
	(tableDefines ["SEQUENCES"])["SPAN"]					= "INTEGER"; /* alignment span w.r.t the reference sequence */
	(tableDefines ["SEQUENCES"])["SCORE"]					= "REAL";
	
	(tableDefines ["SEQUENCES"])["NUC_PASS2"]				= "TEXT";    /* aligned nucleotide sequence; pass 2 */
	(tableDefines ["SEQUENCES"])["REF_PASS2"]				= "TEXT";    /* aligned nucleotide sequence; pass 2 */
	(tableDefines ["SEQUENCES"])["OFFSET_PASS2"]			= "INTEGER"; /* start offset w.r.t the reference sequence */
	(tableDefines ["SEQUENCES"])["SPAN_PASS2"]				= "INTEGER"; /* how many positions in the reference sequence are covered*/
	(tableDefines ["SEQUENCES"])["SCORE_PASS2"]				= "REAL";
	
	(tableDefines ["SEQUENCES"])["FRAME"]					= "INTEGER";
	(tableDefines ["SEQUENCES"])["RC"]						= "INTEGER";
	
	_CreateTableIfNeeded (ANALYSIS_DB_ID, "SETTINGS",  tableDefines["SETTINGS"],  1);
	_CreateTableIfNeeded (ANALYSIS_DB_ID, "SEQUENCES", tableDefines["SEQUENCES"], 1);
	
	/* START ALIGNMENT SETTINGS */
	
	alignOptions ["SEQ_ALIGN_CHARACTER_MAP"]="ARNDCQEGHILKMFPSTWYV";
	
	if ( DO_PIPELINE ) {
		SetDialogPrompt ( "Provide an amino acid alignment score matrix file:" );
		fscanf ( PROMPT_FOR_FILE, "NMatrix", scoreMatrix );
	}
	else {
		ExecuteAFile ( "../Shared/alignmentScoreMatrices/matrixlist.ibf" );
		ChoiceList		( modelIdx,"Choose a score matrix",1,SKIP_NONE, aaModelNames);
		fileToRead = "";
		fileToRead = "../Shared/alignmentScoreMatrices" + DIRECTORY_SEPARATOR + "" + (modelList [modelIdx])["File"];
		fscanf ( fileToRead, "NMatrix", scoreMatrix );
	}
		
		
	alignOptions ["SEQ_ALIGN_SCORE_MATRIX"] = 	scoreMatrix;
	alignOptions ["SEQ_ALIGN_GAP_OPEN"]		= 	10;
	alignOptions ["SEQ_ALIGN_GAP_OPEN2"]	= 	10;
	alignOptions ["SEQ_ALIGN_GAP_EXTEND"]	= 	2;
	alignOptions ["SEQ_ALIGN_GAP_EXTEND2"]	= 	2;
	alignOptions ["SEQ_ALIGN_AFFINE"]		=   1;
	alignOptions ["SEQ_ALIGN_NO_TP"]		=   1; /*Default: do not penalize suffix/prefix indels*/
	
	/* END ALIGNMENT SETTINGS */
	/* REFERENCE SEQUENCES OPTIONS */
	
	DataSetFilter  filteredData 	= CreateFilter	(unal,1);
	
	GetInformation (UnalignedSeqs,filteredData);
	/* preprocess sequences */
	
	unalSequenceCount = Rows(UnalignedSeqs)*Columns(UnalignedSeqs);
	
	GetString (sequenceNames, unal, -1);
	
	longestSequence   	= 0;
	longestSequenceIDX	= 0;
	
	seqRecord			= {};
	
	fprintf (stdout, "[PHASE 1] Initial Processing of ", unalSequenceCount, " sequences\n");
	
	recordBuffer = {};
	transactionChunker = 5000;
	
	fprintf ( stdout, "Minimum read length for inclusion in subsequent analyses\n" );
	fscanf ( stdin, "Number", min_length );
	
	toDoSequences			= {};
	for (seqCounter = 0; seqCounter < unalSequenceCount; seqCounter = seqCounter+1)
	{
		UnalignedSeqs[seqCounter] = UnalignedSeqs[seqCounter]^{{"[^a-zA-Z]",""}};
		UnalignedSeqs[seqCounter] = UnalignedSeqs[seqCounter]^{{"^N+",""}};
		UnalignedSeqs[seqCounter] = UnalignedSeqs[seqCounter]^{{"N+$",""}};
		
		if (Abs (UnalignedSeqs[seqCounter]) >= min_length)
		{		
			seqRecord	["SEQUENCE_ID"] = sequenceNames[seqCounter] && 4;
			seqRecord	["LENGTH"] = Abs (UnalignedSeqs[seqCounter]);
			seqRecord	["STAGE"]  = 0;
			seqRecord	["RAW"]	   = UnalignedSeqs[seqCounter];
			toDoSequences[Abs(toDoSequences)] = sequenceNames[seqCounter];
			
			if (doLongestSequence)
			{
				if (doLongestSequence == 1 || seqCounter != unalSequenceCount-1)
				{
					if (Abs (UnalignedSeqs[seqCounter]) > longestSequence)
					{
						longestSequence    = Abs (UnalignedSeqs[seqCounter]);
						longestSequenceIDX = seqCounter;
					}
				}
			}
			
			recordBuffer [Abs(recordBuffer)] = seqRecord;
			if (Abs(recordBuffer)>transactionChunker)
			{
				_InsertMultipleRecords (ANALYSIS_DB_ID, "SEQUENCES", recordBuffer);
				recordBuffer = {};
			}
		}
		/*SetParameter (STATUS_BAR_STATUS_STRING, "Initial processing ("+seqCounter+"/"+unalSequenceCount+" done)",0);*/
	}
	unalSequenceCount = Abs(toDoSequences);
	
	if (Abs(recordBuffer))
	{
		_InsertMultipleRecords (ANALYSIS_DB_ID, "SEQUENCES", recordBuffer);
	}
	recordBuffer = {};
		
	if (doLongestSequence)
	{
		fprintf			 (stdout, "\nSelected sequence ", sequenceNames[longestSequenceIDX], " as reference.\n");
		masterReferenceSequence = UnalignedSeqs[longestSequenceIDX];
	}
	
	aRecord					= {};
	aRecord["RUN_DATE"]		= _ExecuteSQL(ANALYSIS_DB_ID,"SELECT DATE('NOW') AS CURRENT_DATE");
	aRecord["RUN_DATE"]		= ((aRecord["RUN_DATE"])[0])["CURRENT_DATE"];
	aRecord["OPTIONS"]		= "" + alignOptions;
	aRecord["REFERENCE"]	= masterReferenceSequence;
	aRecord["GENETIC_CODE"] = "" + _Genetic_Code;
	aRecord["MIN_LENGTH"]	= min_length;
	
	/*THESE GET UPDATED IN LATER PIPELINES*/
	aRecord["MIN_COVERAGE"]				= "NULL";
	aRecord["SW_SIZE"]					= "NULL";
	aRecord["SW_STRIDE"]				= "NULL";
	aRecord["MIN_COPIES"]				= "NULL";
	aRecord["DUAL_INFECTION_THRESHOLD"]	= "NULLL";
	aRecord["STANFORD_SCORE"]			= "NULL";
	aRecord["MIN_DR_COVERAGE"]			= "NULL";

	_InsertRecord (ANALYSIS_DB_ID, "SETTINGS", aRecord);
	UnalignedSequences		= 0;
	
}

/* build codon translation table */

codonToAAMap = makeAAMap();

for (p1=0; p1<64; p1=p1+1)
{
	codon 				= nucChars[p1$16]+nucChars[p1%16$4]+nucChars[p1%4];
	ccode 				= _Genetic_Code[p1];
	codonToAAMap[codon] = codeToAA[ccode];
}

/* determine reading frames	*/
sequenceReport 	 = _ExecuteSQL(ANALYSIS_DB_ID, "SELECT LENGTH FROM SEQUENCES");


storageArray	 = {};
recCount		 = sequenceReport["extractLength"][""];
stats			 = GatherDescriptiveStats (avlToMatrix		 ("storageArray"));
/* commented out : push to post analysis processing of db
 PrintDescriptiveStats ("Distribution of read lengths", stats);
 */

consString 	 	  = _ExecuteSQL(ANALYSIS_DB_ID, "SELECT REFERENCE_PASS2 FROM SETTINGS");

/*fprintf ( stdout, consString, "\n" );*/
consString		  = (consString[0])["REFERENCE_PASS2"];

if (Abs(consString) == 0)
{
	fprintf				  (stdout, "\n[PHASE 2] Detecting reading frames for each unprocessed sequence...\n");
	
	frameCounter		  = {3,2};
	stillHasStops		  = {};
	
	aRecord				  = {};
	translRef             = translateToAA (masterReferenceSequence, 0);
	/*adjust reference sequence to be in correct reading frame*/
	bestReferenceFrame = 0;
	for ( _frame = 0; _frame < 3; _frame = _frame + 1 ) {
		translRefString = translateToAA (masterReferenceSequence, _frame);
		stopPos = translRefString||"X"; /*populates a vector with the positions of stop codons */
					
		if (stopPos[0]>=0)
		{
			stopCount = Columns(stopPos)*Rows(stopPos)$2;
		}
		else {
			bestReferenceFrame = _frame;
		}
	}
	if (bestReferenceFrame != 0 ) {
		masterReferenceSequence = masterReferenceSequence[bestReferenceFrame][Abs(masterReferenceSequence)];
	}
	
	/*
	 fprintf ( stdout, translRef, "\n" );
	 */
	inStr				  = {{translRef,""}};
	
	
	
	/*start MPI*/
	if ( MPI_NODE_COUNT > 0 ) {
	
		doneCount = 0;
		_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
		
		seqCounter = 0;
		received = 0;
		
		while ( received < unalSequenceCount )
		{
			if ( seqCounter < unalSequenceCount ) {
				for ( mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode + 1 ) {
					if ( MPINodeState[mpiNode][0] == 0 ) {
						break;
					}
				}
			}
			else {
				mpiNode = MPI_NODE_COUNT-1;
			}
			if ( mpiNode == MPI_NODE_COUNT-1 ) { /* receive jobs */
				
				resultAVL			= {};
				fromNode			= ReceiveJobs ( 0 );
				receivedSeqCounter	= MPINodeInfo[fromNode-1];
				theSeq				= resultAVL["theSeq"];
				bestScorePerBase 	= resultAVL["bestScorePerBase"];
				bestFrame			= resultAVL["bestFrame"];
				bestRC				= resultAVL["bestRC"];
				bestAl				= resultAVL["bestAl"];
				
				if (bestScorePerBase>0)
				{
					alL = computeCorrection(bestAl[1]);
					
					offsetFrom = (bestAl[2]$"^\\-+")[1]+1;
					offsetTo   = (bestAl[2]$"\\-+$")[0]-1;
					if (offsetTo < 0)
					{
						offsetTo = Abs(bestAl[2])-1;
					}
					
					seqOffset  = offsetFrom;
					
					offsetFrom = offsetFrom + alL[0];
					offsetTo   = offsetTo	- alL[1];
					
					theSeq	   = theSeq[3*alL[0]][Abs(theSeq)-3*alL[1]-1];
					
					aaSeq	   = (bestAl[2])[offsetFrom][offsetTo];
					aaSeqRef   = (bestAl[1])[offsetFrom][offsetTo];
					nucSeq	   = ""; nucSeq * 128;
					shifter	   = 0;
					offset	   = bestFrame;
					span	   = 0;
					for (si = 0; si < Abs(aaSeq); si=si+1)
					{
						if (aaSeq[si] == "-")
						{
							nucSeq * "---";
						}
						else
						{
							nucSeq * theSeq [offset][offset+2];
							offset = offset + 3;
						}
						span   = span + (aaSeqRef[si] != "-");
						
					}
					nucSeq	   * 0;
					
					
					rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,"UPDATE SEQUENCES SET " + 
					"STAGE = 1," + 
					"ALIGNED_AA 		=  '"  + aaSeq + "', " +
					"ALIGNED_AA_REF 	=  '"  + aaSeqRef + "', " +
					"ALIGNED 			=  '" + nucSeq + "', " +
					"OFFSET    			=  " + (seqOffset*3+1) + ", " +
					"SPAN				=  " + span*3         + ", " +
					"FRAME    			=  " + (bestFrame) + ", " +
					"RC    				=  " + (bestRC) + ", " +
					"SCORE    			=  " + (bestScorePerBase) + " " +		
					" WHERE SEQUENCE_ID = '" + (toDoSequences[receivedSeqCounter]&&4) + "'");
					
					
					doneCount = doneCount + 1;
					if (doneCount % 500 == 0)
					{	
						_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");
						_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
						doneCount = 0;
					}
				}
				else
				{
					rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,"UPDATE SEQUENCES SET " + 
					"STAGE = 3 " + 	
					" WHERE SEQUENCE_ID = '" + (toDoSequences[receivedSeqCounter]&&4) + "'");
				}
				received = received + 1;
			}
			else {
				
				rawSeq = (_ExecuteSQL(ANALYSIS_DB_ID,"SELECT RAW FROM SEQUENCES WHERE SEQUENCE_ID = '" + (toDoSequences[seqCounter]&&4) + "'"));
				aSeq   = (rawSeq[0])["RAW"];
				
				mpiString = "";
				mpiString * 512;
				
				mpiString * ( "" + mpi_def_string );
				mpiString * ( "_Genetic_Code	= " + _Genetic_Code + ";" );
				mpiString * ( "codonToAAMap		= " + codonToAAMap + ";" );
				mpiString * ( "inStr			= " + inStr + ";" );
				mpiString * ( "resultAVL		= {};" );
				mpiString * ( "minStops  		 = 1e20;" +
				"tString   		 = \"\";" + 
				"bestScorePerBase = 0;" + 
				"bestAl			 = 0;" +
				"aSeq				 = \"" + aSeq + "\";" );
				mpiString * ( "alignOptions		 = " + alignOptions + ";" );
				
				mpiString * (	
				"for (rc = 0; rc<2; rc = rc+1)
				{
					if (rc)
					{
						aSeq = nucleotideReverseComplement (aSeq);
					}
					for (offset = 0; offset < 3; offset = offset+1)
					{
						translString = translateToAA (aSeq, offset);
						stopPos = translString||\"X\";
						if (stopPos[0]>=0)
						{
							stopCount = Columns(stopPos)*Rows(stopPos)$2;
						}
						else
						{
							stopCount 		= 0;
							inStr[1] 		= translString;
							AlignSequences	 (aligned, inStr, alignOptions);
							aligned			= aligned[0];
							alL = computeCorrection (aligned[1]);
							alL = Abs(translString)-alL[0]-alL[1];
							if (alL)
							{
								scorePerBase	= aligned[0]/(alL);
							}
							else
							{
								scorePerBase = 0.0;
							}
							if (scorePerBase > bestScorePerBase)
							{
								theSeq			 = aSeq;
								bestScorePerBase = scorePerBase;
								bestFrame		 = offset;
								bestRC			 = rc;
								bestAl			 = aligned;
								resultAVL[\"theSeq\"]			= aSeq;
								resultAVL[\"bestScorePerBase\"] = scorePerBase;
								resultAVL[\"bestFrame\"]		= offset;
								resultAVL[\"bestRC\"]			= rc;
								resultAVL[\"bestAl\"]			= aligned;
							}
						}
					}
				}" );
				mpiString * ( "resultArrayString = \"\";" );
				mpiString * ( "resultArrayString * 128;" );
				mpiString * ( "resultArrayString * ( \"resultAVL = \" );" );
				mpiString * ( "resultArrayString * ( \"\" + resultAVL );" );
				mpiString * ( "resultArrayString * 0;" );
				mpiString * ( "return resultArrayString;" );
				mpiString * 0;
				
				MPINodeInfo[mpiNode][0]		= seqCounter;
				MPINodeState[mpiNode][0]	= 1; /*set the state as busy */
				MPINodeState[mpiNode][1]	= Time(0); /* set the start time */
				MPISend ( mpiNode+1, mpiString );
				seqCounter = seqCounter + 1;
				
				/*SetParameter (STATUS_BAR_STATUS_STRING, "Reading frame analysis ("+seqCounter+"/"+unalSequenceCount+" done)",0);*/
			}
		}
		_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");
		/*end MPI */
		
	}
	else {
		doneCount = 0;
		_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
		for (seqCounter = 0; seqCounter < unalSequenceCount; seqCounter = seqCounter+1)
		{
			rawSeq = (_ExecuteSQL(ANALYSIS_DB_ID,"SELECT RAW FROM SEQUENCES WHERE SEQUENCE_ID = '" + (toDoSequences[seqCounter]&&4) + "'"));
			aSeq   = (rawSeq[0])["RAW"];
			
			minStops  		 = 1e20;
			tString   		 = "";
			bestScorePerBase = 0; 
			bestAl			 = 0;
			
			for (rc = 0; rc<2; rc = rc+1) /*for forward and reverse*/
			{
				if (rc)
				{
					aSeq = nucleotideReverseComplement (aSeq);
				}
				for (offset = 0; offset < 3; offset = offset+1) /* for each codon position */
				{
					translString = translateToAA (aSeq, offset);
					stopPos = translString||"X"; /*populates a vector with the positions of stop codons */
					
					if (stopPos[0]>=0)
					{
						stopCount = Columns(stopPos)*Rows(stopPos)$2;
					}
					else
					{
						stopCount 		= 0;
						inStr[1] 		= translString;
						AlignSequences	 (aligned, inStr, alignOptions);
						alL  	 		= ;
						aligned			= aligned[0];
						/* check to see if the sequence is not hanging off the edge of the reference */
						
						
						alL = computeCorrection (aligned[1]);
						alL = Abs(translString)-alL[0]-alL[1];
						if (alL)
						{
							scorePerBase	= aligned[0]/(alL);
						}
						else
						{
							scorePerBase = 0.0;
						}
						
						if (scorePerBase > bestScorePerBase)
						{
							theSeq			 = aSeq;
							bestScorePerBase = scorePerBase;
							bestFrame		 = offset;
							bestRC			 = rc;
							bestAl			 = aligned;
						}
					}
				}
			}
			if (bestScorePerBase>0)
			{
				alL = computeCorrection(bestAl[1]);
				
				/*alL is the starting,ending amino acid on the reference relative to the read. if reference exceeds the read, then both are 0*/
				
				offsetFrom = (bestAl[2]$"^\\-+")[1]+1;
				offsetTo   = (bestAl[2]$"\\-+$")[0]-1;
				
				/* the $ looks for the regular expression in bestAl[2] and returns a 2x1 array with the starting and ending 0-based positions of the regular expression. in this case multiple indels, -. returns -1 for both if the regular expression is not found. 
					i.e. 0-based index leading indels start at (bestAl[2]$"^\\-+")[0] and end at (bestAl[2]$"^\\-+")[1]; trailing indels start at (bestAl[2]$"\\-+$")[0] and end at (bestAl[2]$"\\-+$")[0];		
					
					so offSetFrom to offSetTo will return the reference sequence co-ordinates overlapping with the read.
				*/
				
				
				if (offsetTo < 0)
				{
					offsetTo = Abs(bestAl[2])-1; /*if no trailing indels then to end of read*/
				}
				
				seqOffset  = offsetFrom; /*set the offset of the read relative to the reference. ie the number of indels needed on the read to align to the reference */
				
				offsetFrom = offsetFrom + alL[0]; /*if the read starts before the reference then shift to start of reference ie. by alL[0] */
				offsetTo   = offsetTo	- alL[1]; /*if the read extends beyond the reference then shift to end of reference ie. by alL[1] */
			
				theSeq	   = theSeq[3*alL[0]][Abs(theSeq)-3*alL[1]-1]; /*the nucleotide sequence of the read that overlaps with the reference sequence */
				
				aaSeq	   = (bestAl[2])[offsetFrom][offsetTo]; /*amino acid read sequence pruned to exactly overlapping region*/
				aaSeqRef   = (bestAl[1])[offsetFrom][offsetTo]; /*amino acid reference sequence pruned to exactly overlapping region*/
				nucSeq	   = ""; nucSeq * 128;
				shifter	   = 0;
				offset	   = bestFrame;
				span	   = 0;
				
				/*coverts the aligned amino acid sequence into a codon sequence*/
				
				for (si = 0; si < Abs(aaSeq); si=si+1)
				{
					if (aaSeq[si] == "-")
					{
						nucSeq * "---";
					}
					else
					{
						nucSeq * theSeq [offset][offset+2];
						offset = offset + 3;
					}
					span   = span + (aaSeqRef[si] != "-");
					
				}
				nucSeq	   * 0;
				
				
				rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,"UPDATE SEQUENCES SET " + 
				"STAGE = 1," + 
				"ALIGNED_AA 		=  '"  + aaSeq + "', " +
				"ALIGNED_AA_REF 	=  '"  + aaSeqRef + "', " +
				"ALIGNED 			=  '" + nucSeq + "', " +
				"OFFSET    			=  " + (seqOffset*3+1) + ", " +
				"SPAN				=  " + span*3         + ", " +
				"FRAME    			=  " + (bestFrame) + ", " +
				"RC    				=  " + (bestRC) + ", " +
				"SCORE    			=  " + (bestScorePerBase) + " " +		
				" WHERE SEQUENCE_ID = '" + (toDoSequences[seqCounter]&&4) + "'");
				
				
				doneCount = doneCount + 1;
				if (doneCount % 500 == 0)
				{	
					_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");
					_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
					doneCount = 0;
				}
			}
			else
			{
				rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,"UPDATE SEQUENCES SET " + 
				"STAGE = 3 " + 	
				" WHERE SEQUENCE_ID = '" + (toDoSequences[seqCounter]&&4) + "'");
			}
			SetParameter (STATUS_BAR_STATUS_STRING, "Reading frame analysis ("+seqCounter+"/"+unalSequenceCount+" done)",0);
		}
		_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");
	}
	
	haveTable				= _TableExists (ANALYSIS_DB_ID, "BASE_FREQUENCIES");
	if (haveTable)
	{
		baseFrequencies = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT * FROM BASE_FREQUENCIES");
		ExecuteCommands ("baseFrequencies = " + (baseFrequencies[0])["MATRIX"]);
	}
	else
	{
		baseFrequencies = {20,1};
		buildConsensusFrom 		= 	_ExecuteSQL 	(ANALYSIS_DB_ID, "SELECT ALIGNED_AA FROM SEQUENCES WHERE STAGE == 1");
		for (k = 0; k < Abs (buildConsensusFrom); k=k+1)
		{
			thisAA = (buildConsensusFrom [k])["ALIGNED_AA"];
			alLen = Abs(thisAA);
			for (m = 0; m < alLen; m=m+1)
			{	
				thisC = AAMap[thisAA[m]];
				if (thisC<20)
				{
					baseFrequencies [thisC] = baseFrequencies[thisC] + 1;
				}
			}
		}
		aRecord = {};
		normF = {1,20}["1"] * baseFrequencies;
		baseFrequencies = baseFrequencies * (1/normF[0]);
		aRecord["MATRIX"] = "" + baseFrequencies;
		_CreateTableIfNeeded (ANALYSIS_DB_ID, "BASE_FREQUENCIES",  tableDefines["BASE_FREQUENCIES"], 0);
		_InsertRecord (ANALYSIS_DB_ID, "BASE_FREQUENCIES", aRecord);
	}
	
	expectPerBase		    = computeExpectedScore (alignOptions ["SEQ_ALIGN_SCORE_MATRIX"],baseFrequencies);
	if (expectPerBase > 0)
	{
		alignmentThresh = expectPerBase * 5;
	}
	else
	{
		alignmentThresh = -2*expectPerBase;
	}
	
	fprintf 				(stdout, "Expected per base score ", expectPerBase, "\n");
	
	for (k = 1; k<10; k=k+1)
	{
		buildConsensusFrom 		= 	_ExecuteSQL 	(ANALYSIS_DB_ID, "SELECT COUNT(SEQUENCE_ID) AS SEQ_COUNT FROM SEQUENCES WHERE SCORE > " + (expectPerBase+(k-1)*Abs(expectPerBase)));
		fprintf (stdout, "Threshold (x", k ,") = ", (expectPerBase+(k-1)*Abs(expectPerBase)), "  : ",  (buildConsensusFrom[0])["SEQ_COUNT"], " sequences\n");
	}
	
	fprintf ( stdout, "Automatic threshold selection (Y/N)?" );
	fscanf ( stdin, "String", autoselect );
	if ( autoselect == "N" || autoselect == "n" ) {
		fprintf ( stdout, "Select a threshold (1-9) for inclusion of sequences into amino acid alignment:" );
		fscanf ( stdin, "Number", FactorK );
		fprintf					(stdout, "Setting consensus threshold at ", expectPerBase*FactorK, "\n");
		buildConsensusFrom 		= 	_ExecuteSQL 	(ANALYSIS_DB_ID, "SELECT SEQUENCE_ID,ALIGNED_AA,ALIGNED_AA_REF,ALIGNED,OFFSET FROM SEQUENCES WHERE SCORE > " + expectPerBase*FactorK);
		_ExecuteSQL 			(ANALYSIS_DB_ID, "UPDATE SETTINGS SET THRESHOLD = " + expectPerBase*FactorK);
		_ExecuteSQL				(ANALYSIS_DB_ID, "UPDATE SETTINGS SET EXP_PER_BASE_SCORE = " + expectPerBase);
	}
	else {
		buildConsensusFrom = {};
		FactorK = 5;
		fprintf 				(stdout, "[PHASE 3] Filtering and computing an AA-based consensus sequence\n");
		while ( Abs (buildConsensusFrom ) == 0 ) {
			fprintf					(stdout, "Setting consensus threshold at ", expectPerBase*FactorK, "\n");
			buildConsensusFrom 		= 	_ExecuteSQL 	(ANALYSIS_DB_ID, "SELECT SEQUENCE_ID,ALIGNED_AA,ALIGNED_AA_REF,ALIGNED,OFFSET FROM SEQUENCES WHERE SCORE > " + expectPerBase*FactorK);
			_ExecuteSQL 			(ANALYSIS_DB_ID, "UPDATE SETTINGS SET THRESHOLD = " + expectPerBase*FactorK);
			_ExecuteSQL				(ANALYSIS_DB_ID, "UPDATE SETTINGS SET EXP_PER_BASE_SCORE = " + expectPerBase);
			FactorK = FactorK - 1;
		}
		if ( FactorK < 5 ) {
			fprintf ( stdout, "[WARNING] The threshold used for inclusion of sequences into the alignment is less than the default of 5 x expected alignment score. This may be due to poor sequence quality or an innappropriate reference sequence." );
		}
	}
	
	
	
	consReads				= 	Abs(buildConsensusFrom);
	fprintf					(stdout, "Building a consensus sequence from ", consReads, " reads\n");
	refLength				= Abs(translRef);
	
	frequencySpectrum		= {};
	indelSpectrum			= {};
	
	codonStrings 	  = {};
	codonStringToCode = {};
	
	/*two associative arrays for format genetic_code > codon_string and codon_string > genetic_code */
	
	for (k = 0; k < 64; k = k+1)
	{
		if (_Genetic_Code[k] != 10)
		{
			k2 = Abs(codonStrings);
			codonStrings[k2] = codeToCodon (k);
			codonStringToCode [codonStrings[k2]] = k2+1;
		}
	}
	
	alphCharCount			= Abs(codonStrings);
	
	for (k = 0; k <= refLength; k=k+1)
	{
		frequencySpectrum [k] = {alphCharCount,1};
		indelSpectrum[k]	  = {};
	}
	
	/*frequency spectrum is an associative array of length equal to the length of the reference sequence. Each element in the array is a site specific amino acid spectrum*/
	
	for (k = 0; k < consReads; k=k+1)
	{
		seqOffset		= ((-1)+(buildConsensusFrom[k])["OFFSET"])$3;
		thisOffset 		= seqOffset;
		thisAA	   		= (buildConsensusFrom[k])["ALIGNED_AA"];
		thisAARef  		= (buildConsensusFrom[k])["ALIGNED_AA_REF"];
		thisCodon		= (buildConsensusFrom[k])["ALIGNED"];
		
		alLen	   		= Abs (thisAA);
		indelOffset		= 0;
		for (m = 0; m < alLen; m=m+1)
		{
			thisC = codonStringToCode[thisCodon[m*3][m*3+2]];
			if (thisC > 0)
			{
				thisC = thisC-1;
			}
			else
			{
				if (thisAARef[m] != "-")
				{
					thisOffset = thisOffset + 1;
				}
				continue;
			}
			
			if (thisAARef[m] == "-")
			{
				indelOffset = indelOffset+1;
				if (Abs((indelSpectrum[thisOffset])[indelOffset]) == 0)
				{
					(indelSpectrum[thisOffset])[indelOffset] = {alphCharCount,1};
				}
				((indelSpectrum[thisOffset])[indelOffset])[thisC] = ((indelSpectrum[thisOffset])[indelOffset])[thisC] + 1;
			}
			else
			{
				/*if (thisOffset == 279 && thisCodon[m*3][m*3+2] != "AAT")
				 {
				 fprintf (stdout, seqOffset, ":", thisOffset, ":", m, ":", thisAARef[m][m+4], "\n::\n", thisAARef, "\n", thisAA, "\n\n");
				 }*/
				(frequencySpectrum[thisOffset])[thisC] = (frequencySpectrum[thisOffset])[thisC] + 1;
				thisOffset  = thisOffset + 1;
				indelOffset = 0;
			}
		}
	}
	
	indel_cutoff = consReads * 0.005;
	
	consString	  = "";  consStringAA = "";
	consString    * 128; consStringAA * 128;
	
	tableDefines  			["AA_ALIGNMENT"]  = {};
	(tableDefines  			["AA_ALIGNMENT"])["POSITION"]       = "INTEGER";
	(tableDefines  			["AA_ALIGNMENT"])["INDEL_POSITION"] = "INTEGER";
	(tableDefines  			["AA_ALIGNMENT"])["COVERAGE"] 	    = "INTEGER";
	(tableDefines  			["AA_ALIGNMENT"])["REFERENCE"] 	    = "CHAR";
	(tableDefines  			["AA_ALIGNMENT"])["CONSENSUS"] 	    = "CHAR";
	(tableDefines  			["AA_ALIGNMENT"])["REFERENCE_AA"] 	= "CHAR";
	(tableDefines  			["AA_ALIGNMENT"])["CONSENSUS_AA"]   = "CHAR";
	
	for (k = 0; k < alphCharCount; k=k+1)
	{
		(tableDefines  ["AA_ALIGNMENT"])[codonStrings[k]]    = "INTEGER";
	}
	
	_CreateTableIfNeeded (ANALYSIS_DB_ID, "AA_ALIGNMENT", tableDefines["AA_ALIGNMENT"], 1);
	positionRecords = {};
	
	for (k = 0; k < refLength; k=k+1)
	{
		aRecord = {};
		aRecord["POSITION"] 			= k+1;
		aRecord["INDEL_POSITION"] 		= 0;
		aRecord["REFERENCE"]    		= masterReferenceSequence[k*3][k*3+2];
		aRecord["REFERENCE_AA"] 		= codonToAAMap[masterReferenceSequence[k*3][k*3+2]];
		
		res = scoreAPosition(frequencySpectrum[k]);
		localCoverage = res["Coverage"];
		
		aRecord["COVERAGE"] = localCoverage;
		
		/*fprintf (stdout, k+1, " : ", localCoverage, ":", translRef[k], ":");*/
		if (localCoverage)
		{
			maxIdx 							= res["Consensus"];
			consString 						* codonStrings[maxIdx];
			aRecord["CONSENSUS"] 			= codonStrings[maxIdx];
			aRecord["CONSENSUS_AA"] 		= codonToAAMap[codonStrings[maxIdx]];
			consStringAA 					* aRecord["CONSENSUS_AA"];
			for (k2 = 0; k2 < alphCharCount; k2=k2+1)
			{
				aRecord[codonStrings[k2]]    = (frequencySpectrum[k])[k2];
			}
		}
		else
		{
			aRecord["CONSENSUS"] = "---";
			aRecord["CONSENSUS_AA"] = "-";
			/*consString * "-";*/
		}
		positionRecords[Abs(positionRecords)] = aRecord;
		
		indels = Abs(indelSpectrum[k]);
		
		if (indels)
		{
			aRecord["REFERENCE"] = "-";
			for (z = 1; z <= indels; z = z + 1)
			{
				aRecord["INDEL_POSITION"] = z;
				res = scoreAPosition((indelSpectrum[k])[z]);
				if (res["Coverage"] > indel_cutoff)
				{
					consString   * codonStrings[res["Consensus"]];
					consStringAA * codonToAAMap[codonStrings[res["Consensus"]]];
					aRecord["COVERAGE"]  = res["Coverage"];
					aRecord["CONSENSUS"] = codonStrings[res["Consensus"]];
					for (k2 = 0; k2 < alphCharCount; k2=k2+1)
					{
						aRecord[codonStrings[k2]]    = ((indelSpectrum[k])[z])[k2];
					}
					positionRecords[Abs(positionRecords)] = aRecord;
				}
				else
				{
					break;
				}
			}
		}
	}
	
	_InsertMultipleRecords (ANALYSIS_DB_ID, "AA_ALIGNMENT", positionRecords);
	positionRecords 		= 0;
	consString 				* 0; consStringAA * 0;
	/*fprintf 				(stdout, "\nAmino-acid consensus:\n", consStringAA, "\n");*/
	/*fprintf 				(stdout, "\nCodon consensus:\n", consString, "\n");*/
	current_date			= _ExecuteSQL (ANALYSIS_DB_ID,"SELECT DATE('NOW') AS CD");
	_ExecuteSQL 			(ANALYSIS_DB_ID, "UPDATE SETTINGS SET RUN_DATE = '" + (current_date[0])["CD"] + "',REFERENCE_PASS2='" + consString + "'");
	
}
else
{
	
	fprintf (stdout, "[SKIPPING PHASES 2 AND 3 - FOUND A COMPUTED REFERENCE STRAIN]\n");
	
}

fprintf 				(stdout, "[PHASE 4] Re-aligning with the derived nucleotide consensus\n");

pthresh  = ((_ExecuteSQL 			(ANALYSIS_DB_ID, "SELECT THRESHOLD FROM SETTINGS"))[0])["THRESHOLD"];
pthresh2 = 0 + ((_ExecuteSQL 		(ANALYSIS_DB_ID, "SELECT THRESHOLD_PASS2 FROM SETTINGS"))[0])["THRESHOLD_PASS2"];

inStr = {{consString,""}};

if (pthresh2 == 0)
{
	dbSequences 			= _ExecuteSQL (ANALYSIS_DB_ID, "SELECT SEQUENCE_ID FROM SEQUENCES WHERE STAGE = 1 AND SCORE >= " + pthresh);
	unalSequenceCount		= Abs (dbSequences);
	if (unalSequenceCount == 0)
	{
		return 0;
	}
	scores 					= {unalSequenceCount,1};
	fprintf					(stdout, "Based on ", unalSequenceCount, " sequences \n");
	fprintf 				(stdout, "[PHASE 4.1] Computing nucleotide alignment threshold score \n");
	
	if ( MPI_NODE_COUNT > 0 ) {
		runNucleotideAlignmentMPI 	(-1e25,-1,0);
	}
	else {
		runNucleotideAlignment (-1e25,-1,0);
	}
	scores 					= scores%0;
	
	stats			 		= GatherDescriptiveStats (scores);
	PrintDescriptiveStats 	("Distribution of per base nucleotide scores", stats);
	
	pthresh2 				= scores[unalSequenceCount*7$10];
	/*pthresh2 				= prompt_for_a_value ("Per base alignment score threshold for inclusion in the phase 2 reference alignment?",pthresh2,-10000,10000,0);*/
	
	_ExecuteSQL 			(ANALYSIS_DB_ID, "UPDATE SETTINGS SET THRESHOLD_PASS2 = " + pthresh2);
}

fprintf 				(stdout, "Using ", pthresh2 ,"/base nucleotide alignment threshold score \n");

dbSequences 			= _ExecuteSQL (ANALYSIS_DB_ID, "SELECT SEQUENCE_ID FROM SEQUENCES WHERE STAGE = 3");
unalSequenceCount		= Abs (dbSequences);
if (unalSequenceCount)
{
	scores = {unalSequenceCount,1};
	fprintf 				(stdout, "[PHASE 4.2] Aligning ",unalSequenceCount," out-of-frame sequences \n");
	
	if ( MPI_NODE_COUNT > 0 ) {	
		runNucleotideAlignmentMPI  (pthresh2,2,1);
	}
	else {
		runNucleotideAlignment (pthresh2,2,1);
	}
}

haveTable				= _TableExists (ANALYSIS_DB_ID, "NUC_ALIGNMENT");

if (haveTable == 0)
{	
	fprintf 				(stdout, "[PHASE 5] Generating a nucleotide sequence profile \n");
	tableDefines  			["NUC_ALIGNMENT"]  = {};
	(tableDefines  			["NUC_ALIGNMENT"])["POSITION"]       	= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["INDEL_POSITION"] 	= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["COVERAGE"] 	    	= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["REFERENCE"] 	    = "CHAR";
	(tableDefines  			["NUC_ALIGNMENT"])["CONSENSUS"] 	    = "CHAR";
	
	(tableDefines  			["NUC_ALIGNMENT"])["A"] 	    		= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["C"] 	    		= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["G"] 	    		= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["T"] 	    		= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["DEL"] 	    		= "INTEGER";
	(tableDefines  			["NUC_ALIGNMENT"])["AMBIG"] 	    	= "INTEGER";
	
	buildConsensusFrom 		= 	_ExecuteSQL 	(ANALYSIS_DB_ID, "SELECT SEQUENCE_ID, NUC_PASS2,REF_PASS2,OFFSET_PASS2 FROM SEQUENCES WHERE STAGE = 1 OR STAGE = 2");
	
	consReads				= 	Abs(buildConsensusFrom);
	fprintf					(stdout, "Building a frequency spectrum from ", consReads, " reads\n");
	refLength				= Abs(consString);
	frequencySpectrum		= {};
	indelSpectrum			= {};
	
	
	fprintf ( stdout, "consensus string length = ", Abs ( consString ), "\n" );
	fprintf ( stdout, consString, "\n" );
	
	for (k = 0; k <= refLength; k=k+1)
	{
		frequencySpectrum [k] = {6,1};
		indelSpectrum[k]	  = {};
	}
	
	nucCode = {};
	nucCode ["A"] = 1;
	nucCode ["C"] = 2;
	nucCode ["G"] = 3;
	nucCode ["T"] = 4;
	nucCode ["-"] = 5;
	
	for (k = 0; k < consReads; k=k+1)
	{
		thisOffset 		= ((-1)+(buildConsensusFrom[k])["OFFSET_PASS2"]);
		thisNuc	   		= (buildConsensusFrom[k])["NUC_PASS2"];
		thisNucRef  	= (buildConsensusFrom[k])["REF_PASS2"];
		
		
		
		/*fprintf ( stdout, "thisOffset = ", thisOffset, "; thisNuc = ", thisNuc, "; thisNucRef = ", thisNucRef, "\n" ); */
		
		
		alLen	   		= Abs (thisNuc);
		
		/*
		if ( alLen > 0 ) {
			fprintf ( stdout, "\n\nseqID:\t", (buildConsensusFrom[k])["SEQUENCE_ID"], "\n" );
			fprintf ( stdout, "thisOffset = ", thisOffset, "\n" );
			fprintf ( stdout, "cons:\t", Abs ( consString ), "\n", consString, "\n" );
			fprintf ( stdout, "read:\t", Abs ( thisNuc ), "\n", thisNuc, "\n" );
			fprintf ( stdout, "refr:\t", Abs ( thisNucRef ), "\n", thisNucRef, "\n\n" );
		}
*/
		
		
		indelOffset		= 0;
		for (m = 0; m < alLen; m=m+1)
		{
			thisC = nucCode[thisNuc[m]];
			if (thisC > 0)
			{
				thisC = thisC-1;
			}
			else
			{
				thisC = 5;
			}
			
			if (thisNucRef[m] == "-")
			{
				indelOffset = indelOffset+1;
				if (Abs((indelSpectrum[thisOffset])[indelOffset]) == 0)
				{
					(indelSpectrum[thisOffset])[indelOffset] = {6,1};
				}
				((indelSpectrum[thisOffset])[indelOffset])[thisC] = ((indelSpectrum[thisOffset])[indelOffset])[thisC] + 1;
			}
			else
			{			
				/*fprintf ( stdout, "thisOffset = ", thisOffset, "; thisC = ", thisC, "\n" ); */
				(frequencySpectrum[thisOffset])[thisC] = (frequencySpectrum[thisOffset])[thisC] + 1;
				thisOffset  = thisOffset + 1;
				indelOffset = 0;
			}
		}
	}
	
	indel_cutoff = consReads * 0.005;
	
	consStringNuc	  = ""; 
	consStringNuc    * 128;
	
	_CreateTableIfNeeded	 (ANALYSIS_DB_ID, "NUC_ALIGNMENT", tableDefines["NUC_ALIGNMENT"], 1);
	
	positionRecords = {};
	nucFields 		= {{"A","C","G","T","DEL","AMBIG"}};
	alphCharCount	= Columns (nucFields);
	
	for (k = 0; k < refLength; k=k+1)
	{
		aRecord = {};
		aRecord["POSITION"] = k+1;
		aRecord["INDEL_POSITION"] = 0;
		aRecord["REFERENCE"] = consString[k];
		
		res 			= scoreAPosition(frequencySpectrum[k]);
		localCoverage 	= res["Coverage"];
		
		aRecord["COVERAGE"] = localCoverage;
		
		/*fprintf (stdout, k+1, " : ", localCoverage, ":", translRef[k], ":");*/
		if (localCoverage)
		{
			maxIdx 					= res["Consensus"];
			if (maxIdx<4)
			{
				consStringNuc 		    * NucLetters [maxIdx];
			}
			aRecord["CONSENSUS"] 	= NucLetters [maxIdx];
			
			for (k2 = 0; k2 < alphCharCount; k2=k2+1)
			{
				aRecord[nucFields[k2]]    = (frequencySpectrum[k])[k2];
			}
		}
		else
		{
			aRecord["CONSENSUS"] = "-";
		}
		positionRecords[Abs(positionRecords)] = aRecord;
		
		indels = Abs(indelSpectrum[k]);
		
		if (indels)
		{
			aRecord["REFERENCE"] = "-";
			for (z = 1; z <= indels; z = z + 1)
			{
				aRecord["INDEL_POSITION"] = z;
				res = scoreAPosition((indelSpectrum[k])[z]);
				if (res["Coverage"] > indel_cutoff)
				{
					k2 = NucLetters[res["Consensus"]];
					consStringNuc * k2;
					aRecord["COVERAGE"]  = res["Coverage"];
					aRecord["CONSENSUS"] = k2;
					for (k2 = 0; k2 < alphCharCount; k2=k2+1)
					{
						aRecord[nucFields[k2]]    = ((indelSpectrum[k])[z])[k2];
					}
					positionRecords[Abs(positionRecords)] = aRecord;
				}
				else
				{
					break;
				}
			}
		}
	}
	
	remainingCount = 0;
	
	if ( DO_PIPELINE ) {
		remainingSeqs	= baseFilePath + "_uds." + dagene + ".remaining.fas";
	}
	else {
		remainingSeqs	= noPipeline_filePath + "_uds." + dagene + ".remaining.fas";
	}
	fprintf (remainingSeqs, CLEAR_FILE, KEEP_OPEN);
	DoSQL (ANALYSIS_DB_ID,"SELECT RAW,SPAN_PASS2,SEQUENCE_ID FROM SEQUENCES", "return writeRemainingSequences();");
	fprintf (remainingSeqs, CLOSE_FILE);
	
	_InsertMultipleRecords (ANALYSIS_DB_ID, "NUC_ALIGNMENT", positionRecords);
	positionRecords 		= 0;
	consStringNuc 	   	    * 0;
	/*fprintf (stdout, consStringNuc, "\n");*/
}	

_closeCacheDB			(ANALYSIS_DB_ID);



/*-------------------------------------------------*/
function writeRemainingSequences ()
{
	if (0+SQL_ROW_DATA[1] == 0)
	{
		remainingCount = remainingCount + 1;
		fprintf (remainingSeqs, ">", SQL_ROW_DATA[2], "\n", SQL_ROW_DATA[0], "\n");
	}
	return 0;
}

/*-------------------------------------------------*/
function runNucleotideAlignmentMPI (score_thresh, code, doRC)
{
	doneCount = 0;
	if (code>=0)
	{
		stageCode = "STAGE = " + code + ",";
	}
	else
	{
		stageCode = "";
	}
	_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");
	
	MPINodeInfo		= {MPI_NODE_COUNT-1,1};
	MPINodeState	= {MPI_NODE_COUNT-1,2};
	seqCounter		= 0;
	received		= 0;
	while ( received < unalSequenceCount ) 
	{
		if ( seqCounter < unalSequenceCount ) {
			for ( mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode + 1 ) {
				if ( MPINodeState[mpiNode][0] == 0 ) {
					break;
				}
			}
		}
		else {
			mpiNode = MPI_NODE_COUNT-1;
		}
		if ( mpiNode == MPI_NODE_COUNT-1 ) { /*receive da jobs*/
			resultAVL2 = {};
			fromNode = ReceiveJobs ( 0 );
			receivedSeqCounter = MPINodeInfo[fromNode-1];
			alL			= resultAVL2["AVL_alL"];
			aligned		= resultAVL2["AVL_aligned"];
			correctors	= resultAVL2["AVL_correctors"];
			
			if (alL)
			{
				scores[receivedSeqCounter]	= aligned[0]/alL;
			}
			else
			{
				scores[receivedSeqCounter] = 0.0;
			}
			alStr = aligned[2];
			alL	  = Abs(alStr);
			for (offsetFrom = 0; offsetFrom < alL; offsetFrom = offsetFrom + 1)
			{
				if (alStr[offsetFrom] != "-")
				{
					break;
				}
			}
			for (offsetTo = alL-1; offsetTo > 0; offsetTo = offsetTo - 1)
			{
				if (alStr[offsetTo] != "-")
				{
					break;
				}
			}
			if (scores[receivedSeqCounter] > score_thresh)
			{
				alignedRefSequence = (aligned[1])[offsetFrom][offsetTo];
				alignedRefSequence = alignedRefSequence[correctors[0]][Abs(alignedRefSequence)-1-correctors[1]];
				offsetWD = offsetFrom;
				offsetFrom		   = offsetFrom + correctors[0];
				offsetTo		   = offsetTo   - correctors[1];
				howmanyChars	   = alignedRefSequence^{{"[A-Z]",""}};
				span_nuc_aln	   = (Abs(alignedRefSequence)-Abs(howmanyChars));
				
				if (span_nuc_aln >= min_length)
				{
					/*fprintf (stdout, "Added range ", offsetFrom, "-", offsetTo, " span = ", span_nuc_aln, "\n"); */
					rawSQL  = "UPDATE SEQUENCES SET " + 
					stageCode + 
					"NUC_PASS2 			=  '"  + alStr[offsetFrom][offsetTo] + "', " +
					"REF_PASS2		 	=  '"  + alignedRefSequence + "', " +
					"OFFSET_PASS2    	=  "   + (offsetWD+1) + ", " +
					"SPAN_PASS2    		=  "   + span_nuc_aln + ", " +
					"SCORE_PASS2    	=  "   + (scores[receivedSeqCounter]) + " " +		
					" WHERE SEQUENCE_ID = '"   +((dbSequences[receivedSeqCounter])["SEQUENCE_ID"]&&4) + "'";
					
					rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,rawSQL);
					
					
					doneCount = doneCount + 1;
					
					if (doneCount % 500 == 0)
					{	
						_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");
						_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
						doneCount = 0;
					}
					
				}
			}
			else
			{
				rawSQL  = "UPDATE SEQUENCES SET STAGE = 4,"+
				"NUC_PASS2 			=  '"  + alStr[offsetFrom][offsetTo] + "', " +
				"REF_PASS2		 	=  '"  + (aligned[1])[offsetFrom][offsetTo] + "', " +
				"SCORE_PASS2    	=  " + (scores[receivedSeqCounter]) + " WHERE SEQUENCE_ID = '" +((dbSequences[receivedSeqCounter])["SEQUENCE_ID"]&&4) + "'";
				rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,rawSQL);		
			}
			received = received + 1;
		}
		else { /*send da jobs*/
			rawSeq   = _ExecuteSQL(ANALYSIS_DB_ID,"SELECT RAW,RC FROM SEQUENCES WHERE SEQUENCE_ID = '" + ((dbSequences[seqCounter])["SEQUENCE_ID"]&&4) + "'");
			aSeq   	 = (rawSeq[0])["RAW"];
			
			mpiString = "";
			mpiString * 128;
			mpiString * (	"" + mpi_def_string );
			mpiString * (	"checkRC = " + (0 + (rawSeq[0])["RC"]) + ";" );
			mpiString * (	"doRC = " + doRC + ";" );
			mpiString * (	"inStr = " + inStr + ";" );
			mpiString * (	"aSeq = \"" + aSeq+ "\";" );
			
			mpiString * (	"alignOptions_p2 = " + alignOptions_p2 + ";" );
			mpiString * (   "resultAVL2 = {};" );
			mpiString * (	"if (doRC == 0 && checkRC)
							{
								inStr[1] = nucleotideReverseComplement(aSeq);
							}
							else
							{
								inStr[1] = aSeq;	
							}" );
							
			
			
			mpiString * (	"AlignSequences(aligned, inStr, alignOptions_p2);" );
			
			mpiString * (	"if (doRC)
							{
								inStr[1] = 	nucleotideReverseComplement (aSeq);
								AlignSequences(aligned2, inStr, alignOptions_p2);
								if ((aligned2[0])[0] > (aligned[0])[0])
								{
									aligned = aligned2;
								}
							}
							aligned	= aligned[0];
							correctors = computeCorrection(aligned[1]);
							alL = Abs(aSeq)-correctors[0]-correctors[1];" );
							
			mpiString * (	"resultAVL2[\"AVL_alL\"] = alL;
							 resultAVL2[\"AVL_aligned\"] = aligned;
							 resultAVL2[\"AVL_correctors\"] = correctors;" );
							 
			mpiString * ( "resultArrayString = \"\";" );
			mpiString * ( "resultArrayString * 128;" );
			mpiString * ( "resultArrayString * ( \"resultAVL2 = \" );" );
			mpiString * ( "resultArrayString * ( \"\" + resultAVL2 );" );
			mpiString * ( "resultArrayString * 0;" );
			mpiString * ( "return resultArrayString;" );
			
			mpiString * 0;
			
			MPISend ( mpiNode+1, mpiString );
			MPINodeInfo[mpiNode][0]		= seqCounter;
			MPINodeState[mpiNode][0]	= 1;
			MPINodeState[mpiNode][1]	= Time(0);
			seqCounter = seqCounter + 1;
		}
	}
	 
	_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");	
	return doneCount;
}

function runNucleotideAlignment (score_thresh, code, doRC)
{
	doneCount = 0;
	if (code>=0)
	{
		stageCode = "STAGE = " + code + ",";
	}
	else
	{
		stageCode = "";
	}
	_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
	
	for (seqCounter = 0; seqCounter < unalSequenceCount; seqCounter = seqCounter+1)
	{
		/*fprintf (stdout, seqCounter, "/", unalSequenceCount, "\n");*/
		rawSeq   = _ExecuteSQL(ANALYSIS_DB_ID,"SELECT RAW,RC FROM SEQUENCES WHERE SEQUENCE_ID = '" + ((dbSequences[seqCounter])["SEQUENCE_ID"]&&4) + "'");
		aSeq   	 = (rawSeq[0])["RAW"];
		if (doRC == 0 && 0 + (rawSeq[0])["RC"])
		{
			/*fprintf (stdout, "*RC\n");	*/	
			inStr[1] = nucleotideReverseComplement(aSeq);
		}
		else
		{
			inStr[1] = aSeq;	
		}
		AlignSequences(aligned, inStr, alignOptions_p2);
		if (doRC)
		{
			inStr[1] = 	nucleotideReverseComplement (aSeq);
			AlignSequences(aligned2, inStr, alignOptions_p2);
			if ((aligned2[0])[0] > (aligned[0])[0])
			{
				aligned = aligned2;
				/*fprintf (stdout, "RC\n");*/
			}
		}
		
		aligned	= aligned[0];
		
		
		correctors = computeCorrection(aligned[1]); /*number of indels to add to reference consensus sequence to align with read at start and end */
							
		alL = Abs(aSeq)-correctors[0]-correctors[1]; /*the length of fully overlapping sequence */
		if (alL)
		{
			scores[seqCounter]	= aligned[0]/alL;
		}
		else
		{
			scores[seqCounter] = 0.0;
		}
		alStr = aligned[2]; /*the 454 read */
		
		alL	  = Abs(alStr);
		for (offsetFrom = 0; offsetFrom < alL; offsetFrom = offsetFrom + 1)
		{
			if (alStr[offsetFrom] != "-")
			{
				break;
			}
		}
		for (offsetTo = alL-1; offsetTo > 0; offsetTo = offsetTo - 1)
		{
			if (alStr[offsetTo] != "-")
			{
				break;
			}
		}
				
		if (scores[seqCounter] > score_thresh)
		{
			alignedRefSequence = (aligned[1])[offsetFrom][offsetTo];
			alignedRefSequence = alignedRefSequence[correctors[0]][Abs(alignedRefSequence)-1-correctors[1]];
			
			offsetWD = offsetFrom;
			/*the following modification to offset to include only the exactly overlapping region. however we still need to know the offset of the read with respect to the consensus. setting OFFSET_PASS2 equal to offsetFrom would be incorrect since that assumes the read is starting @ OFFSET_PASS2 with respect to the consensus. WD added new offset here.*/
			
			offsetFrom		   = offsetFrom + correctors[0];
			offsetTo		   = offsetTo   - correctors[1];
			
			howmanyChars	   = alignedRefSequence^{{"[A-Z]",""}};
			span_nuc_aln	   = (Abs(alignedRefSequence)-Abs(howmanyChars));
			
			if (span_nuc_aln >= min_length)
			{
				/*fprintf (stdout, "Added range ", offsetFrom, "-", offsetTo, " span = ", span_nuc_aln, "\n"); */
				rawSQL  = "UPDATE SEQUENCES SET " + 
							stageCode + 
							"NUC_PASS2 			=  '"  + alStr[offsetFrom][offsetTo] + "', " +
							"REF_PASS2		 	=  '"  + alignedRefSequence + "', " +
							"OFFSET_PASS2    	=  "   + (offsetWD+1) + ", " + /*changed to offsetWD, see above*/
							"SPAN_PASS2    		=  "   + span_nuc_aln + ", " +
							"SCORE_PASS2    	=  "   + (scores[seqCounter]) + " " +		
							" WHERE SEQUENCE_ID = '"   +((dbSequences[seqCounter])["SEQUENCE_ID"]&&4) + "'";
						
				rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,rawSQL);
				
	
				doneCount = doneCount + 1;
				if (doneCount % 500 == 0)
				{	
					_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");
					_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
					doneCount = 0;
				}
			}
		}
		else
		{
			rawSQL  = "UPDATE SEQUENCES SET STAGE = 4,"+
									"NUC_PASS2 			=  '"  + alStr[offsetFrom][offsetTo] + "', " +
									"REF_PASS2		 	=  '"  + (aligned[1])[offsetFrom][offsetTo] + "', " +
									"SCORE_PASS2    	=  " + (scores[seqCounter]) + " WHERE SEQUENCE_ID = '" +((dbSequences[seqCounter])["SEQUENCE_ID"]&&4) + "'";
			rawSeq = _ExecuteSQL(ANALYSIS_DB_ID,rawSQL);		
		}
	}	
	_ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");	
	return doneCount;
}


/*-------------------------------------------------*/

function ReceiveJobs ( null )	/*Modified from NielsenYang.bf */
{
	
	MPIReceive (-1, fromNode, result_String);
	timer2     = MPINodeState[fromNode-1][1];
	
	MPINodeState[fromNode-1][0] = 0;
	MPINodeState[fromNode-1][1] = 0;
	
	/*fprintf ( stdout, result_String, "\n" );*/
	
	ExecuteCommands ( result_String );
	return fromNode;
}


/*-------------------------------------------------*/

function extractLength (key, value)
{
	storageArray [Abs (storageArray)] = 0+value["LENGTH"];
	return 0;
}

/*-------------------------------------------------*/

function scoreAPosition (matrix)
{
	localCoverage = 0;
	maxScore      = 0;
	maxIdx	      = 0;
	for (m = 0; m < alphCharCount; m = m + 1)
	{
		localCoverage = localCoverage + matrix[m];
		if (matrix[m] > maxScore)
		{
			maxScore = matrix[m];
			maxIdx	  = m;
		}
	}
	res = {};
	res["Coverage"]  = localCoverage;
	res["Consensus"] = maxIdx;
	return res;
}

/*-------------------------------------------------*/

function computeExpectedScore (scoreMatrix, freqVector)
{
	sum = 0;
	for (i=0; i<20; i=i+1)
	{
		sum = sum + freqVector[i]^2 * scoreMatrix[i][i];
		
		for (j=i+1; j<20; j=j+1)
		{
			sum = sum + 2*scoreMatrix[i][j]*freqVector[i]*freqVector[j];
		}
	}
	return sum;
}

/*-------------------------------------------------*/

function	codeToCodon (int_code)
{
	return NucLetters[int_code$16] + NucLetters[(int_code%16$4)] + NucLetters[int_code%4];
}