DNDS_TABLE = "DNDS";

ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"GrabBag.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DescriptiveStatistics.bf");
ExecuteAFile					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"HXB2Mapper.bf");
skipCodeSelectionStep = 1;
ExecuteAFile					(HYPHY_LIB_DIRECTORY + "TemplateBatchFiles" + DIRECTORY_SEPARATOR + "TemplateModels" + DIRECTORY_SEPARATOR + "chooseGeneticCode.def");
ExecuteAFile					(HYPHY_LIB_DIRECTORY + "TemplateBatchFiles" + DIRECTORY_SEPARATOR + "Distances" + DIRECTORY_SEPARATOR + "CodonTools.def");
ExecuteAFile					(HYPHY_LIB_DIRECTORY + "TemplateBatchFiles" + DIRECTORY_SEPARATOR + "binomial.ibf");

fscanf ( stdin, "Number", geneticCodeTable );
ApplyGeneticCodeTable (geneticCodeTable);

SetDialogPrompt 		("454 run database file:");

ANALYSIS_DB_ID			= _openCacheDB ("");
DB_FILE_PATH 			= LAST_FILE_PATH;
NUC_LETTERS		= "ACGT";

fprintf					(stdout, "Minimum coverage for considering a site:" );
fscanf					(stdin,"Number", coverageThreshold );

tableInfo = {};
tableInfo["POS"]			= "INTEGER"; 
tableInfo["CONS_AA"]		= "CHAR";
tableInfo["S_SITES"]		= "REAL";
tableInfo["NS_SITES"]		= "REAL";
tableInfo["S_SUBS"]			= "REAL";
tableInfo["NS_SUBS"]		= "REAL";
tableInfo["PP_REAL"]		= "REAL";
tableInfo["PN_REAL"]		= "REAL";
_CheckDBID ( ANALYSIS_DB_ID, DNDS_TABLE, tableInfo );

_recordsFound = {};
DoSQL ( ANALYSIS_DB_ID, "SELECT * FROM AA_ALIGNMENT", "return _matchRecordsByField(0);" );
mu_map = _recordsFound;


consensus_nuc		= GetField ( mu_map, "CONSENSUS", 0 );
consensus_aa		= GetField ( mu_map, "CONSENSUS_AA", 0 );
reference_nuc		= GetField ( mu_map, "REFERENCE", 0 );
reference_aa		= GetField ( mu_map, "REFERENCE_AA", 0 );
reference_position	= GetField ( mu_map, "POSITION", 1 );
coverage_array		= GetField ( mu_map, "COVERAGE", 1 );

_codonToAA = defineCodonToAA();
refAA      = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT REFERENCE AS REF FROM SETTINGS");
refAA      = translateCodonToAA ((refAA[0])["REF"],_codonToAA,0);


for ( _j = 0; _j < Rows ( coverage_array ); _j = _j + 1 ) {
	if ( coverage_array [ _j ] > coverageThreshold ) {
		siteCodonFreqs = GetCodonsFreqsAtSite ( mu_map, _j, coverage_array [ _j ] );
		dndsDict = computePairwiseDNDSFromSpectrum ( siteCodonFreqs, coverage_array [ _j ] );
			
		SQLString = "";
		SQLString * 128;
		SQLString * ( "INSERT INTO " + DNDS_TABLE + " VALUES ('" + reference_position[_j] + "', '" + consensus_aa[_j] );
		SQLString * ( "', '" + dndsDict["S_SITES"] + "', '" + dndsDict["NS_SITES"] + "', '" + dndsDict["S_SUBS"] + "', '" + dndsDict["NS_SUBS"] + "', '" + dndsDict["PP"] + "', '" + dndsDict["PN"] + "')" );
		SQLString * 0;
		DoSQL ( ANALYSIS_DB_ID, SQLString, "" ); 
	}
}

DoSQL ( SQL_CLOSE, "", ANALYSIS_DB_ID );




/* ------------- functions --------------------- */

function GetCodonsFreqsAtSite ( records, site, depth ) {
	
	array = { 64, 1 };
	for ( _h = 0; _h < 64; _h = _h + 1 ) {
		codonString = NUC_LETTERS[_h$16] + NUC_LETTERS [(_h%16)$4] + NUC_LETTERS [_h%4];
		ExecuteCommands ( "intVal = (records[\"" + site + "\"])[\"" + codonString + "\"];" );
		array [ _h ] = (0 + intVal)/depth;
	}
	return array;

}

function GetField ( records, field, makeArray ) {

	if ( makeArray ) { /*store Field data as an array*/
		array = { Abs ( records ), 1 };
		for ( _g = 0; _g < Abs ( records ); _g = _g + 1 ) {
			ExecuteCommands ( "intVal = (records[\"" + _g + "\"])[\"" + field + "\"];" );
			array [ _g ] = 0 + intVal;
		}
		return array;
	}
	else { /*store as a concatenated string */
		totalString = "";
		totalString * 128;
		for ( _g = 0; _g < Abs ( records ); _g = _g + 1 ) {
			stringVal = "";
			ExecuteCommands ( "stringVal = (records[\"" + _g + "\"])[\"" + field + "\"];" );
			totalString * ( stringVal );
		}
		totalString * 0;
		return totalString;
	}

}

function computePairwiseDNDSFromSpectrum (spectrum, number)
/* 
	'spectrum' is assumed to be a row or a column vector of 64 (not 61) frequencies for each codon,
	something that would be returned by HarvestFrequencies, for example 
	
	'number' is the total number of reads in the sample (> 1)
	
	returns an dictionary with the following keys
	
		"S_SITES"  : expected number of syn sites based on the spectrum
		"NS_SITES" : expected number of non-syn sites based on the spectrum
		"S_SUBS"   : expected number of synonymous subs
		"NS_SUBS"  : expected number of non-subs
		"PP"	   : p-value for NS_SITES/S_SITES < NS_SUBS/S_SUBS  (positive selection)
		"PN"	   : p-value for NS_SITES/S_SITES > NS_SUBS/S_SUBS  (negative selection)
*/	
{
	/* first compute S_SITES and NS_SITES, 
	   and also the list of non-zero codons */

	sites_count = {2,1};
	_codonMap   = RawToSense (_Genetic_Code);
	non_zero	= {};
	
	for (_k = 0; _k < 64; _k = _k+1)
	{
		if (spectrum[_k])
		{
			sites_count = sites_count + _S_NS_POSITIONS_[-1][_k]*spectrum[_k];
			non_zero +  _k; /* dictionary + something adds something with the integer key of Abs (avl) */
			
		}
		
	}

	/* now compute pairwise substitutions 	
	   for each codon x, we compute the average of substitutions from every other possible codon y,
	   
	   Pr (codon x is the parent and codon y is the child)*/
	   
	observed_syn = 0;
	observed_ns  = 0;
	   
	for (_k = 0; _k < Abs (non_zero); _k = _k+1)
	{
		for (_k2 = 0; _k2 < Abs (non_zero); _k2 = _k2+1)
		{
			if (_k != _k2)
			{
				observed_syn = observed_syn + _OBSERVED_S_[_codonMap[non_zero[_k]]][_codonMap[non_zero[_k2]]]  * spectrum[non_zero[_k2]] * spectrum[non_zero[_k]] * number;
				observed_ns  = observed_ns  + _OBSERVED_NS_[_codonMap[non_zero[_k]]][_codonMap[non_zero[_k2]]] * spectrum[non_zero[_k2]] * spectrum[non_zero[_k]] * number;
			}
		}
	}
	
	total = observed_syn+observed_ns;
	if (total)
	{
		probSyn = sites_count[0]/(sites_count[0]+sites_count[1]);
		pp      = extendedBinTail   (total,probSyn,observed_syn);
		pn      = 1-extendedBinTail (total,probSyn,Max(0,observed_syn-1));
	}	
	else
	{
		pp = 1; pn = 1;
	}
	
	return {"S_SITES": sites_count__[0],
			"NS_SITES": sites_count__[1],
			"S_SUBS": observed_syn__,
			"NS_SUBS": observed_ns__,
			"PP": pp__,
			"PN": pn__};
			
}