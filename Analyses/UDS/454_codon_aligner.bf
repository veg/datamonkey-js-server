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


fprintf (stdout, "Homology score expected?");
fscanf  (stdin, "Number", hom_exp);


AALetters						= "ACDEFGHIKLMNPQRSTVWY?-";
NucLetters						= "ACGT-N";
AAMap							= {};
CodonMap                        = {};


for (k = 0; k < Abs (AALetters); k+=1) {
	AAMap[AALetters[k]] = k;
}

for (k = 0; k < 64; k += 1) {
    CodonMap [NucLetters[k$16] + NucLetters[k%16$4] + NucLetters[k%4]] = k+1;
}


SetDialogPrompt ( "Provide a database file for storing results (if empty one will be created):" );
DoSQL           (SQL_OPEN, PROMPT_FOR_FILE, ANALYSIS_DB_ID);

fscanf ( stdin, "Number", refOption );
fscanf ( stdin, "String", dagene );

if ( refOption != 2 ) {
	fscanf ( stdin, "String", masterReferenceSequence );
}


if (_TableExists (ANALYSIS_DB_ID, "SETTINGS")) {
	existingSettings = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT * FROM SETTINGS");
}

tableDefines			   = {"BASE_FREQUENCIES" : {"MATRIX" : "TEXT"}};


if (Abs(existingSettings))
{
	existingSettings = Eval("existingSettings [0]");
	_CDN_DO_NOT_DEFINE_OPTIONS = 1;
	ExecuteAFile    ("454_codon_aligner_data.ibf");
	_CDN_DO_NOT_DEFINE_OPTIONS = 0;
	_Genetic_Code           = Eval(existingSettings["GENETIC_CODE"]);
	_cdnaln_alnopts         = Eval(existingSettings["OPTIONS"]);
	_cdnaln_protScoreMatrix = Eval(existingSettings["PROT_SCORE_MATRIX"]);
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
	(tableDefines ["SETTINGS"])["PROT_SCORE_MATRIX"] 		= "TEXT";
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
	(tableDefines ["SEQUENCES"])["ALIGNED"]					= "TEXT";    /* aligned nucleotide sequence */
	(tableDefines ["SEQUENCES"])["ALIGNED_AA"]				= "TEXT";    /* aligned prot sequence */
	(tableDefines ["SEQUENCES"])["ALIGNED_AA_REF"]				= "TEXT";    /* aligned prot reference */
	(tableDefines ["SEQUENCES"])["OFFSET_NUC"]				= "INTEGER"; /* start offset w.r.t the reference sequence */
	(tableDefines ["SEQUENCES"])["OFFSET"]					= "INTEGER"; /* start offset w.r.t the reference sequence, converted to AA */
	(tableDefines ["SEQUENCES"])["SPAN"]					= "INTEGER"; /* alignment span w.r.t the reference sequence */
	(tableDefines ["SEQUENCES"])["SCORE"]					= "REAL";
	(tableDefines ["SEQUENCES"])["TOOLONG"]					= "INTEGER"; // how many homopolymers were too long in this read
	(tableDefines ["SEQUENCES"])["TOOSHORT"]			    = "INTEGER"; // how many homopolymers were too short in this read
	(tableDefines ["SEQUENCES"])["ALIGNED_NOTCLEAN"]					= "TEXT";    /* aligned nucleotide sequence before homopolymer cleanup*/
	(tableDefines ["SEQUENCES"])["ALIGNED_NOTCLEAN_REF"]					= "TEXT";    /* aligned _reference_ nucleotide sequence before homopolymer cleanup*/
	
	(tableDefines ["SEQUENCES"])["NUC_PASS2"]				= "TEXT";    /* aligned nucleotide sequence; pass 2 */
	(tableDefines ["SEQUENCES"])["REF_PASS2"]				= "TEXT";    /* aligned nucleotide sequence; pass 2 */
	(tableDefines ["SEQUENCES"])["OFFSET_PASS2"]			= "INTEGER"; /* start offset w.r.t the reference sequence */
	(tableDefines ["SEQUENCES"])["SPAN_PASS2"]				= "INTEGER"; /* how many positions in the reference sequence are covered*/
	(tableDefines ["SEQUENCES"])["SCORE_PASS2"]				= "REAL";
	
	(tableDefines ["SEQUENCES"])["RC"]						= "INTEGER";
	
	_CreateTableIfNeeded (ANALYSIS_DB_ID, "SETTINGS",  tableDefines["SETTINGS"],  1);
	_CreateTableIfNeeded (ANALYSIS_DB_ID, "SEQUENCES", tableDefines["SEQUENCES"], 1);
	
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
	
	_cdnaln_protScoreMatrix = scoreMatrix;
	ExecuteAFile    ("454_codon_aligner_data.ibf");

	/* REFERENCE SEQUENCES OPTIONS */
	
	DataSetFilter  filteredData 	= CreateFilter	(unal,1);
	GetInformation (UnalignedSeqs,filteredData);
	unalSequenceCount = Rows(UnalignedSeqs)*Columns(UnalignedSeqs);
	
	GetString (sequenceNames, unal, -1);
	
	longestSequence   	= 0;
	longestSequenceIDX	= 0;
	seqRecord			= {};
	
	fprintf (stdout, "[PHASE 1] Initial Processing of ", unalSequenceCount, " sequences\n");
	
	recordBuffer = {};
	transactionChunker = 5000;
	
	fprintf ( stdout, "Minimum read length for inclusion in subsequent analyses\n" );
	fscanf  ( stdin, "Number", min_length );
	
	toDoSequences			= {};
	
	ensureThatTheNamesAreUnique = {};
	
	for (seqCounter = 0; seqCounter < unalSequenceCount; seqCounter += 1)
	{
		UnalignedSeqs[seqCounter] = _cndaln_clean_input_sequence (UnalignedSeqs[seqCounter]);

		if (Abs (UnalignedSeqs[seqCounter]) >= min_length)
		{		
		    proposedSeqName = sequenceNames[seqCounter];
		    while (ensureThatTheNamesAreUnique[proposedSeqName]) {
		        proposedSeqName += Random (0,9)$1;
		    }
		    
			seqRecord	["SEQUENCE_ID"]       = proposedSeqName && 4;
			seqRecord	["LENGTH"]            = Abs (UnalignedSeqs[seqCounter]);
			seqRecord	["STAGE"]             = 0;
			seqRecord	["RAW"]	              = UnalignedSeqs[seqCounter];
			toDoSequences + proposedSeqName;
			
			ensureThatTheNamesAreUnique[proposedSeqName] = 1;
			
			recordBuffer + seqRecord;
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

	
	aRecord					= {};
	aRecord["RUN_DATE"]		= _ExecuteSQL(ANALYSIS_DB_ID,"SELECT DATE('NOW') AS CURRENT_DATE");
	aRecord["RUN_DATE"]		= ((aRecord["RUN_DATE"])[0])["CURRENT_DATE"];
	aRecord["OPTIONS"]		= "" + _cdnaln_alnopts;
	aRecord["PROT_SCORE_MATRIX"]		= "" + _cdnaln_protScoreMatrix;
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

assert (Abs(masterReferenceSequence) <= 3600, "The reference sequence cannot exceed 3600 nucleotides in length");


if (Abs(masterReferenceSequence) %3 ) {
    masterReferenceSequence = masterReferenceSequence[0][Abs(masterReferenceSequence)-1-Abs(masterReferenceSequence)%3];
}

expectPerBase = computeExpectedPerBaseScore (hom_exp);
fprintf (stdout, "Using per base threshold of ", expectPerBase, "\n");


/* build codon translation table */

codonToAAMap = makeAAMap();

for (p1=0; p1<64; p1+=1)
{
	codon 				= nucChars[p1$16]+nucChars[p1%16$4]+nucChars[p1%4];
	ccode 				= _Genetic_Code[p1];
	codonToAAMap[codon] = codeToAA[ccode];
}
codonToAAMap["---"] = "-";

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

/*--------------------------------------------------------------------------------*/
// SEQUENCE ALIGNMENT TOOLS FOR MPI
/*--------------------------------------------------------------------------------*/

function prepareRangeForScoring (from,to,masterSequence,homology,pass2) {
    fscanf ("454_align_some_sequences.ibf", REWIND, "Raw", code);
    _thisSet = {};
    
    seqUpperLimit = Abs(toDoSequences);
    
	for (seqCounter = from; seqCounter < Min(to,seqUpperLimit); seqCounter += 1) {
	    if (pass2) {
		    _seq_field_name = "ALIGNED";
	    } else {
	        _seq_field_name = "RAW";
		}
		rawSeq = (_ExecuteSQL(ANALYSIS_DB_ID,"SELECT `_seq_field_name` FROM SEQUENCES WHERE SEQUENCE_ID = '" + (toDoSequences[seqCounter]&&4) + "'"));
	    _thisSet [toDoSequences[seqCounter]] = (rawSeq[0])[_seq_field_name] ^ {{"[^ACGT]",""}};
	}
	
	return "izpass2=" + pass2 + ";_cdnaln_protScoreMatrix = "+_cdnaln_protScoreMatrix+";\ncodonToAAMap=" + codonToAAMap+ ";\nmasterReferenceSequence=\"`masterSequence`\";\nhomExp = " + homology + ";\nsequences2align = " + _thisSet + ";\nLoadFunctionLibrary  (\"" + PATH_TO_CURRENT_BF + "454_codon_aligner_data.ibf\");\nLoadFunctionLibrary  (\"" + PATH_TO_CURRENT_BF + "../Shared/nucleotide_options.def\");" + code;
}

function avlToSQLInsertRecord (avl) {
    _fields = Rows (avl); 
    _field_counter = Abs (avl);
    _avl_record = {1,_field_counter};
    for (_fc2 = 0; _fc2 < _field_counter; _fc2 += 1) {
        if (Type (avl[_fields[_fc2]]) == "String") {
            _avl_record [_fc2] = _fields[_fc2] + " = '" + (avl[_fields[_fc2]] && 4) + "'";
        } else { 
            _avl_record [_fc2] = _fields[_fc2] + " = " + avl[_fields[_fc2]];
        }
    }
    return Join (",", _avl_record);
}

function insertPass1AVLIntoDB (records) {
 	_ExecuteSQL (ANALYSIS_DB_ID, "BEGIN TRANSACTION");	
   
    _seq_names = Rows (records);
    //fprintf ("sql.dump", CLEAR_FILE, KEEP_OPEN);
    for (_rec_id = 0; _rec_id < Abs (records); _rec_id += 1) {
        fieldsToUpdate = avlToSQLInsertRecord (records[_seq_names[_rec_id]]);
        sql_code = "UPDATE SEQUENCES SET " + 
				fieldsToUpdate  +
				" WHERE SEQUENCE_ID = '" + (_seq_names[_rec_id] && 4) + "'" ;
		//fprintf ("sql.dump", sql_code, "\n");
        _ExecuteSQL (ANALYSIS_DB_ID, sql_code);	
    }
   
    _ExecuteSQL (ANALYSIS_DB_ID, "COMMIT");	

    return 0;
}

function batchAlignSomeSequences (batchRefSequence, epb, pass2option) {
	
	upperLoopBound  = Abs (toDoSequences); 
	
	if ( MPI_NODE_COUNT > 1 && upperLoopBound > MPI_NODE_COUNT) {
	    per_node = upperLoopBound $ MPI_NODE_COUNT;
	    from_record = 0;
	    
	    do_receive = 1;
	    
	    for (mpi_node = 1; mpi_node < MPI_NODE_COUNT; mpi_node += 1){
	        to_record = from_record + per_node;
	        fprintf (stdout, "[SENDING range ", from_record, " -- ", to_record, " to MPI node ", mpi_node, "]\n");
	        MPISend (mpi_node, prepareRangeForScoring (from_record, to_record, batchRefSequence, epb,pass2option));
	        from_record = to_record;
	    }
	    
	} else {
	    from_record = 0;
	    do_receive  = 0;
	}

    for (seqCounter = from_record; seqCounter < upperLoopBound; seqCounter = seqCounter+1)
    {
	     fprintf (stdout, "[RUNNING range ", from_record, " - ", upperLoopBound, " on the master node]\n");
	     recs = prepareRangeForScoring (from_record, upperLoopBound, batchRefSequence, epb,pass2option);
	     //fprintf ("dump.bf", CLEAR_FILE, recs, "\n");
         ExecuteCommands (recs, {}, "aligner");
         insertPass1AVLIntoDB (aligner.result_AVL);
    }
	
	if (do_receive == 1) {
	    for (mpi_node = 1; mpi_node < MPI_NODE_COUNT; mpi_node += 1){
            MPIReceive (-1, fromNode, theJob);
            fprintf (stdout, "[RECEIVED ALIGNED SEQUENCES FROM MPI NODE ", fromNode, "]\n");
            insertPass1AVLIntoDB (Eval(theJob));
        }
	}
	return 0;
}

/*--------------------------------------------------------------------------------*/
/*--------------------------------------------------------------------------------*/


if (Abs(consString) == 0)
{
	translRef             = translateToAA (masterReferenceSequence, 0);
	fprintf				    (stdout, "\n[PHASE 2] Aligning to provided reference...\n");
	
	batchAlignSomeSequences (masterReferenceSequence,expectPerBase ,0);
	
	haveTable				= _TableExists (ANALYSIS_DB_ID, "BASE_FREQUENCIES");
	
	buildConsensusFrom 		= 	_ExecuteSQL 	(ANALYSIS_DB_ID, "SELECT ALIGNED_AA, ALIGNED, ALIGNED_AA_REF, OFFSET, OFFSET_NUC FROM SEQUENCES WHERE STAGE == 1");
	if (haveTable)
	{
		baseFrequencies = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT * FROM BASE_FREQUENCIES");
		ExecuteCommands ("baseFrequencies = " + (baseFrequencies[0])["MATRIX"]);
	}
	else
	{
		baseFrequencies = {20,1};
		for (k = 0; k < Abs (buildConsensusFrom); k=k+1)
		{
			thisAA = (buildConsensusFrom [k])["ALIGNED_AA"];
			alLen = Abs(thisAA);
			for (m = 0; m < alLen; m=m+1)
			{	
				thisC = AAMap[thisAA[m]];
				if (thisC<20)
				{
					baseFrequencies [thisC] += 1;
				}
			}
		}
		aRecord = {};
		baseFrequencies = baseFrequencies * (1/(+baseFrequencies));
		aRecord["MATRIX"] = "" + baseFrequencies;
		_CreateTableIfNeeded (ANALYSIS_DB_ID, "BASE_FREQUENCIES",  tableDefines["BASE_FREQUENCIES"], 0);
		_InsertRecord (ANALYSIS_DB_ID, "BASE_FREQUENCIES", aRecord);
	}
	
	consReads				= Abs(buildConsensusFrom);
	refLength				= Abs(translRef);
	fprintf					(stdout, "Building a consensus sequence from ", consReads, " reads\n");
	
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
	
	/*frequency spectrum is an associative array of length equal to the length of the reference sequence. 
	Each element in the array is a site specific amino acid spectrum*/
	
	//fprintf (stdout, "\n>REF\n", translRef, "\n");
	
	for (k = 0; k < consReads; k=k+1)
	{
		thisOffset 		= 0+(buildConsensusFrom[k])["OFFSET"]-1;
		nucOffset       = 0+(buildConsensusFrom[k])["OFFSET_NUC"];
		thisAA	   		= (buildConsensusFrom[k])["ALIGNED_AA"];
		thisAARef  		= (buildConsensusFrom[k])["ALIGNED_AA_REF"];
		thisCodon		= (buildConsensusFrom[k])["ALIGNED"];
		
		/*
		fprintf (stdout, ">", k, "\n");
		for (k2 = 0; k2 < thisOffset; k2+=1) {
		    fprintf (stdout, "-");
		}
		fprintf (stdout, thisAA, "\n");
		*/
		
		shiftCodonSequenceByThisMuch = (3-nucOffset%3)%3;
		if (shiftCodonSequenceByThisMuch) {
		    thisCodon = thisCodon [shiftCodonSequenceByThisMuch][Abs(thisCodon)-1];
		}
		
		alLen	   		= Abs (thisAA);
		indelOffset		= 0;
		for (m = 0; m < alLen; m=m+1)
		{
			thisC = codonStringToCode[thisCodon[m*3][m*3+2]];
			/*if (thisC != thisAA[m]) {
			    fprintf (stdout, thisCodon[m*3][m*3+2], ":", thisC, ":", thisAA[m], ":", shiftCodonSequenceByThisMuch, ":", nucOffset,":", thisOffset, "\n",  (buildConsensusFrom[k])["ALIGNED"], "\n", (buildConsensusFrom[k])["ALIGNED_AA"], "\n");
			    return 0;
			}*/
			if (thisC > 0)
			{
				thisC = thisC-1;
			}
			else
			{
				if (thisAARef[m] != "-")
				{
					thisOffset += 1;
				}
				continue;
			}
			
			if (thisAARef[m] == "-")
			{
				indelOffset += 1;
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
				/*assert (thisOffset < Abs (frequencySpectrum), "Internal alignment error: sequence offset "+thisOffset+" is over the allocated limit of " + Abs (frequencySpectrum)+ "\n" + thisAARef + "\nand\n" + thisAA 
				                + "\nSequence offset:" +thisOffset+ "\n");*/
				(frequencySpectrum[thisOffset])[thisC] = (frequencySpectrum[thisOffset])[thisC] + 1;
				thisOffset  += 1;
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
		//fprintf (stdout, k+1, " : ", localCoverage, ":", translRef[k], ":", aRecord["CONSENSUS"], ":", aRecord["CONSENSUS_AA"], "\n");
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
	fprintf 				(stdout, "\nAmino-acid consensus:\n", consStringAA, "\n");
	fprintf 				(stdout, "\nCodon consensus:\n", consString, "\n");
	current_date			= _ExecuteSQL (ANALYSIS_DB_ID,"SELECT DATE('NOW') AS CD");
	_ExecuteSQL 			(ANALYSIS_DB_ID, "UPDATE SETTINGS SET RUN_DATE = '" + (current_date[0])["CD"] + "',REFERENCE_PASS2='" + consString + "'");
}
else
{
	fprintf (stdout, "[SKIPPING PHASES 2 AND 3 - FOUND A COMPUTED REFERENCE STRAIN]\n");
}


need_nucleotide_realignment = _ExecuteSQL (ANALYSIS_DB_ID,"SELECT SEQUENCE_ID FROM SEQUENCES WHERE STAGE = 1");
toDoSequences			= {};
for (k = 0; k < Abs (need_nucleotide_realignment); k += 1)
{
    toDoSequences + (need_nucleotide_realignment[k])["SEQUENCE_ID"];
}

if (Abs (toDoSequences)) {
 	fprintf 				(stdout, "[PHASE 4] Realigning ", Abs(toDoSequences), " to sample reference\n");
    batchAlignSomeSequences (consString,expectPerBase ,1);
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
		alLen	   		= Abs (thisNuc);
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
				/*assert (thisOffset < Abs (frequencySpectrum) && Type (frequencySpectrum[thisOffset]) == "Matrix", "Internal alignment error: sequence offset "
				                +thisOffset+" is over the allocated limit of " + Abs (frequencySpectrum)+ "\n" + thisNucRef + "\nand\n" + thisNuc 
				                + "\nSequence id: " + (buildConsensusFrom[k])["SEQUENCE_ID"] + "\nSpectrum:" + frequencySpectrum[thisOffset] + 
				                "\n" + Type (frequencySpectrum[thisOffset]) + "\n");*/
				(frequencySpectrum[thisOffset])[thisC] = (frequencySpectrum[thisOffset])[thisC] + 1;
				thisOffset  += 1;
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
	fprintf (stdout, consStringNuc, "\n");
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

function	codeToCodon (int_code)
{
	return NucLetters[int_code$16] + NucLetters[(int_code%16$4)] + NucLetters[int_code%4];
}
