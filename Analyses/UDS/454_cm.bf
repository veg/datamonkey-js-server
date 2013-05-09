
fprintf ( stdout, "Provide a genetic code:" );
fscanf	( stdin,  "Number", _local_GeneticCode );
fprintf ( stdout, "Provide the amino acid score matrix file:" );
fscanf	( stdin,  "String", _local_scoreMatrix );
fprintf ( stdout, "Provide the gene index:" );
fscanf	( stdin,  "Number", _local_idx );

ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"GrabBag.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DescriptiveStatistics.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"ReadDelimitedFiles.bf");

SetDialogPrompt                 ("454 run database file:");
CP_DBID                 = _openCacheDB ("");
DB_FILE_PATH    = LAST_FILE_PATH;


skipCodeSelectionStep = 1;
ExecuteAFile					(HYPHY_LIB_DIRECTORY + "TemplateBatchFiles" + DIRECTORY_SEPARATOR + "TemplateModels" + DIRECTORY_SEPARATOR + "chooseGeneticCode.def");
ApplyGeneticCodeTable (_localGeneticCode);
ExecuteAFile					(HYPHY_LIB_DIRECTORY + "TemplateBatchFiles" + DIRECTORY_SEPARATOR + "Distances" + DIRECTORY_SEPARATOR + "CodonTools.def");
ExecuteAFile					("../Shared/hiv_1_ref_sequences.ibf");

MINSCORE		= 5;
MINTESTSITES	= 10;
SCORE_FACTOR	= 5;

NUC_LETTERS		= "ACGT";
codonMap = {};
for (p1=0; p1<64; p1=p1+1)
{
	codon = NUC_LETTERS[p1$16]+NUC_LETTERS[p1%16$4]+NUC_LETTERS[p1%4];
	ccode = _Genetic_Code[p1];
	codonMap[codon] = _hyphyAAOrdering[ccode];
}

fscanf ( "../Shared/accessoryMutationList.lst", "Lines", compMuList );
accMu = {};
accMu["PRIMARY_SITE"]		= {};
accMu["PRIMARY_WT"]			= {};
accMu["PRIMARY_RT"]			= {};
accMu["SECONDARY_SITE"]		= {};
accMu["SECONDARY_WT"]		= {};
accMu["SECONDARY_RT"]		= {};

for ( _i = 1; _i < Columns ( compMuList ); _i = _i + 1 ) {
	_dataArray	= splitOnRegExp ( compMuList [ _i ], "[ \t]+" );
	/*fprintf ( stdout, _dataArray, "\n" );*/
	primary		= _dataArray[0];
	secondary	= _dataArray[1];
	ExecuteCommands ( "(accMu[\"PRIMARY_SITE\"])[\"" + (_i-1) + "\"] = "  +  primary[1][Abs(primary)-2] + ";" );
	ExecuteCommands ( "(accMu[\"PRIMARY_WT\"])[\"" + (_i-1) + "\"] = \"" + primary[0] + "\";" );
	ExecuteCommands ( "(accMu[\"PRIMARY_RT\"])[\"" + (_i-1) + "\"] = \"" + primary[Abs(primary)-1] + "\";" );
	ExecuteCommands ( "(accMu[\"SECONDARY_SITE\"])[\"" + (_i-1) + "\"] = " + secondary[1][Abs(secondary)-2] + ";" );
	ExecuteCommands ( "(accMu[\"SECONDARY_WT\"])[\"" + (_i-1) + "\"] = \"" + secondary[0] + "\";" );
	ExecuteCommands ( "(accMu[\"SECONDARY_RT\"])[\"" + (_i-1) + "\"] = \"" + secondary[Abs(secondary)-1] + "\";" );

}

if ( __local_idx > 10 || __local_idx == 6 ) {
	nuc_hxb2	= RefSeqs [ __local_idx ];
}
else { /*all sites mapped to pol*/
	nuc_hxb2	= RefSeqs [ 11 ];
}

/*fprintf ( stdout, nuc_hxb2, "\n" );*/

aa_hxb2		= translateCodonToAA ( nuc_hxb2, codonMap, 0 );

fileString = "../Shared/alignmentScoreMatrices" + DIRECTORY_SEPARATOR + _local_scoreMatrix;
fscanf ( fileString, "NMatrix", scoreMatrix );

_hxb_alignOptions_aa = {};
_hxb_alignOptions_aa ["SEQ_ALIGN_CHARACTER_MAP"]="ARNDCQEGHILKMFPSTWYV";
_hxb_alignOptions_aa ["SEQ_ALIGN_SCORE_MATRIX"] = 	scoreMatrix;
_hxb_alignOptions_aa ["SEQ_ALIGN_GAP_OPEN"]		= 	40;
_hxb_alignOptions_aa ["SEQ_ALIGN_GAP_OPEN2"]	= 	20;
_hxb_alignOptions_aa ["SEQ_ALIGN_GAP_EXTEND"]	= 	10;
_hxb_alignOptions_aa ["SEQ_ALIGN_GAP_EXTEND2"]	= 	5;
_hxb_alignOptions_aa ["SEQ_ALIGN_AFFINE"]		=   1;
_hxb_alignOptions_aa ["SEQ_ALIGN_NO_TP"]		=	1;


testArray = {2,2}; /*i.e.	DR&ACCESSORY !DR&ACCESSORY DR&!ACCESSORY !DR&!ACCESSORY */
testSites = 0;
	
tableInfo = {};
tableInfo["READ_ID"]			= "TEXT";
tableInfo["PRIMARY_SITE"]		= "INTEGER";
tableInfo["PRIMARY_WT"]			= "CHAR";
tableInfo["PRIMARY_RT"]			= "CHAR";
tableInfo["PRIMARY_OBS"]		= "CHAR";
tableInfo["SECONDARY_SITE"]		= "INTEGER";
tableInfo["SECONDARY_WT"]		= "CHAR";
tableInfo["SECONDARY_RT"]		= "CHAR";
tableInfo["SECONDARY_OBS"]		= "CHAR";
tableInfo["HXB2_AA"]			= "TEXT";
tableInfo["READ_AA"]			= "TEXT";
tableInfo["PER_BASE_SC"]		= "REAL";
tableInfo["EXP_PER_BASE_SC"]	= "REAL";	
_CheckDBID ( ANALYSIS_DB_ID, "ACCESSORY_MUTATIONS", tableInfo );
	
_dbRecordCounter = 0;
DoSQL ( CP_DBID, "SELECT * FROM SEQUENCES", "return _CountMatchingRecords(0)");
totalRecords	= _dbRecordCounter;
		
fprintf (stdout, "[454 COMP MUT] Looking for matching records...\n");
_recordsFound = {};
DoSQL ( CP_DBID, "SELECT * FROM SEQUENCES WHERE SCORE >= '" + MINSCORE + "' OR SCORE_PASS2 >= '" + MINSCORE + "'", "return _matchRecordsByField(0);" ); 
_sequenceRecords = _recordsFound;
fprintf (stdout, "[454 COMP MUT] Found ", Abs (_sequenceRecords), "...\n");


DoSQL (CP_DBID, "PRAGMA journal_mode=OFF", "");

timer = Time(1);
	
for ( _k1 = 0; _k1 < Abs ( _sequenceRecords ); _k1 = _k1 + 1 ) {
	span	= 0 + (_sequenceRecords[_k1])["SPAN"];
	span2	= 0 + (_sequenceRecords[_k1])["SPAN_PASS2"];
	/*if (_k1 && _k1 % 100 == 0) {
		fprintf (stdout, _k1, ":", (_k1) / (Time(1)-timer), "\n");
	}*/
	if (  ( Abs ( span ) > 0  || Abs ( span2 ) > 0 ) ) {  /* good read */
		read_id		= (_sequenceRecords[_k1])["SEQUENCE_ID"];
		read_aa		= (_sequenceRecords[_k1])["ALIGNED_AA"];
		ref_aa		= (_sequenceRecords[_k1])["ALIGNED_AA_REF"];
		read_nuc	= (_sequenceRecords[_k1])["ALIGNED"];
			
		hxb2map		= mapSequenceToHXB2(ref_aa,aa_hxb2,_hxb_alignOptions_aa);
		
		/* the current list only includes reverse transcriptase drug resistant mutations and accessory mutations */
		start_aa = hxb2map[0]-99;
		end_aa = (hxb2map[0]-99) + ( Abs ( read_aa ) - 1 );
		
		
		/*check for alignment quality to reference*/
		_recordsFound = {};
		DoSQL ( CP_DBID, "SELECT * from BASE_FREQUENCIES", "return _matchRecordsByField(1);" );
		ExecuteCommands ( "baseFrequencies = " + (_recordsFound[0])["MATRIX"]);
		expectPerBase = computeExpectedScore (scoreMatrix,baseFrequencies);
		perBase		= 0 + (aligned[0])["0"]/Abs(ref_aa);
		
		/*fprintf ( stdout, expectPerBase, " ", perBase, "\n" );*/
		
		/*
		fprintf ( stdout, expectPerBase, "\n" );
		fprintf ( stdout, aligned, "\n" );
		*/

		SQLString = "";
                SQLString * 256;		
		
		if ( perBase > SCORE_FACTOR*expectPerBase ) {
			for ( _m = 0; _m < Columns ( compMuList ); _m = _m + 1 ) {
				/*fprintf ( stdout, "read # ", _k1, "; DRM # ", _m, "\n" );*/
				ExecuteCommands ( "site1  = (accMu[\"PRIMARY_SITE\"])[\"" + _m + "\"];" );
				ExecuteCommands ( "site2  = (accMu[\"SECONDARY_SITE\"])[\"" + _m + "\"];" );
				if ( ( site1 >= start_aa ) && ( site1 <= end_aa ) && ( site2 > start_aa ) && ( site2 <= end_aa ) && ( ( site1 != 0 ) && ( site2 != 0 ) ) ) {
					
					ExecuteCommands ( "wt1  = (accMu[\"PRIMARY_WT\"])[\"" + _m + "\"];" );
					ExecuteCommands ( "rt1  = (accMu[\"PRIMARY_RT\"])[\"" + _m + "\"];" );
					ExecuteCommands ( "wt2  = (accMu[\"SECONDARY_WT\"])[\"" + _m + "\"];" );
					ExecuteCommands ( "rt2  = (accMu[\"SECONDARY_RT\"])[\"" + _m + "\"];" );
					
					mu1 = read_aa [ site1-start_aa-1 ];
					mu2 = read_aa [ site2-start_aa-1 ];
					if (  ( mu1 == rt1 ) && ( mu2 == rt2 ) ) { /*DR & ACC*/
						testArray[0][0] += 1;
					}
					if ( ( mu1 != rt1 ) && ( mu2 == rt2 ) ) { /*!DR & ACC*/
						testArray[0][1] += 1;
					} 
					if ( ( mu1 == rt1 ) && ( mu2 != rt2 ) ) { /*DR & !ACC*/
						testArray[1][0] += 1;
					}
					if ( ( mu1 != rt1 ) && ( mu2 != rt2 ) ) { /*!DR & !ACC*/
						testArray[1][1] += 1;;
					}
					
					//SQLString = "";
					//SQLString * 256;
					SQLString * ( "INSERT INTO ACCESSORY_MUTATIONS VALUES ('" + read_id + "', '" + site1 + "', '" + wt1 + "', '" + rt1 + "', '" + mu1 + "', '" + site2 + "', '" + wt2 + "', '" + rt2 + "', '" + mu2 );
					SQLString * ( "', '" + ( ((aligned[0])["1"])[hxb2map[0]][hxb2map[0] + Abs(ref_aa)-1] ) + "', '" + read_aa + "', '" + perBase + "', '" + expectPerBase + "');" );
					//SQLString * 0;
					//DoSQL ( CP_DBID, SQLString, "" );
					testSites = testSites + 1;
				}
			}
		}
		SQLString * 0;
		DoSQL ( CP_DBID, SQLString, "" );

	}
}

/*fprintf ( stdout, "Found ", testSites, " occurences of both drug resistant and accessory mutations\n" );*/

if ( testSites >  MINTESTSITES ) {
		
	tableInfo = {};
	tableInfo["DR_ACC"]			= "TEXT";
	tableInfo["NOTDR_ACC"]		= "INTEGER";
	tableInfo["DR_NOTACC"]		= "CHAR";
	tableInfo["NOTDR_NOTACC"]	= "CHAR";
	tableInfo["P_VAL"]			= "REAL";
	_CheckDBID ( ANALYSIS_DB_ID, "ACCESSORY_TEST", tableInfo );

	SQLString = "";
	SQLString * 128;
	SQLString * ( "INSERT INTO ACCESSORY_TEST VALUES ('" + testArray[0][0] + "', '" + testArray[0][1] + "', '" + testArray[1][0] + "', '" + testArray[1][1] + "', '" + CChi2 ( testArray, 0 ) + "');" );
	SQLString * 0;
	DoSQL ( CP_DBID, SQLString, "" );
}
DoSQL ( SQL_CLOSE, "", CP_DBID );


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

function mapSequenceToHXB2 (seq,hxb2_seq,_options)
{
	_seqLen	  = Abs(seq);
	_coordMap = {_seqLen,1};
	
	_inStr 		 = {{hxb2_seq,seq}};
	AlignSequences(aligned, _inStr, _options);
	
	_alignedHXB  = (aligned[0])[1];
	_alignedQRY  = (aligned[0])[2];
		
	_referenceStart = (_alignedHXB$"^\\-+")[0]+1;
	
	for (_k = 0; _k < _referenceStart; _k = _k+1)
	{
		_coordMap[_k] = _referenceStart-1;
	}
	
	_qryCoord = _k;
	_refCoord = _referenceStart;

	while (_k < Abs(_alignedQRY))
	{
		if (_alignedQRY[_k] != "-")
		{
			_coordMap[_qryCoord] = _refCoord;
			_qryCoord = _qryCoord + 1;
		}
		if (_alignedHXB[_k] != "-")
		{
			_refCoord = _refCoord + 1;
		}
		_k = _k+1;
	}
	return _coordMap;
}

function ConvertDate ( dateString ) {

	_date = splitOnRegExp ( dateString, "-" );
	month = 0 + _date [ 1 ];
	if ( month < 10 ) {
		month = (_date [ 1 ])[1];
	}
	day = 0 + _date [2];
	if ( day < 10 ) {
		day = (_date [ 2 ])[1];
	}
	year = (_date[0])[2] + (_date[0])[3];
	month = "" + month;
	day = "" + day;			
		
	newDate = month + "/" + day + "/" + year;
	return newDate;
}
