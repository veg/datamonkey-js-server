BINOMIAL_TABLE	= "MU_RATE_CLASSES";
MU_RATE_TABLE	= "SITE_MU_RATES";
NEB_TABLE		= "SITE_POSTERIORS";

ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"GrabBag.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DescriptiveStatistics.bf");

binomialCoefficients = {};

SetDialogPrompt 		("454 run database file:");
ANALYSIS_DB_ID			= _openCacheDB ("");
DB_FILE_PATH 			= LAST_FILE_PATH;

fprintf ( stdout, "Do drug resistant sites only? (0=no,1=yes)\n" );
fscanf ( stdin, "Number", dr_only );

haveTable				= _TableExists (ANALYSIS_DB_ID, "AA_ALIGNMENT");
if (!haveTable)
{
	fprintf (stdout, "[ERROR: NO AA_ALIGNMENT TABLE IN ", DB_FILE_PATH, "]\n");
	return 0;
}

_recordsFound = {};
DoSQL ( ANALYSIS_DB_ID, "SELECT NUM_RATES,AIC FROM " + BINOMIAL_TABLE + " WHERE AIC=(SELECT min(AIC) FROM " + BINOMIAL_TABLE + ")", "return _matchRecordsByField (1);");
if ( Abs ( _recordsFound ) ) {
	
	numRates = 0 + (_recordsFound[0])["NUM_RATES"];
	minAIC = (_recordsFound[0])["AIC"];
	
	_recordsFound = {};
	DoSQL ( ANALYSIS_DB_ID, "SELECT MU_RATE,WEIGHT FROM " + BINOMIAL_TABLE + " WHERE AIC='" + minAIC + "' ORDER BY MU_RATE;", "return _matchRecordsByField(1);" );
	_rates = _recordsFound;
	
	_rateWeightM = {numRates, 2};
	for ( _k = 0; _k < Abs ( _rates ); _k = _k + 1 ) {
		_rateWeightM [ _k ][ 0 ] = 0 + (_rates[_k])["MU_RATE"];
		_rateWeightM [ _k ][ 1 ] = 0 + (_rates[_k])["WEIGHT"];
	}
	
	if ( dr_only ) { /*drug resistant mutations only*/
		NEB_TABLE		= "SITE_DR_POSTERIORS";
		MDR_TABLE		= "MDR_VARIANTS";
		
		_recordsFound = {};
		DoSQL ( ANALYSIS_DB_ID, "SELECT MDR_SITE,SITE_GENE_START,COVERAGE,RESISTANCE FROM " + MDR_TABLE + ";", "return _matchRecordsByField(1);" );
		_siteInfo = _recordsFound;
		
		tableInfo = {};
		tableInfo["MDR_SITE"]			= "INTEGER";
		tableInfo["SITE_GENE_START"]	= "INTEGER";
		tableInfo["COVERAGE"]			= "INTEGER";
		tableInfo["RESISTANCE"]			= "INTEGER";
		tableInfo["RATE_CLASS"]			= "INTEGER";
		tableInfo["RATE"]				= "REAL";
		tableInfo["WEIGHT"]				= "REAL";
		tableInfo["POSTERIOR"]			= "REAL";
		_CheckDBID ( ANALYSIS_DB_ID, NEB_TABLE, tableInfo );
		
		for ( _k = 0; _k < Abs ( _siteInfo ); _k = _k + 1 ) {
			total = 0 + (_siteInfo[_k])["COVERAGE"];
			choose = 0 + (_siteInfo[_k])["RESISTANCE"];
			
			denominator = 0;
			for ( _l = 0; _l < numRates; _l = _l + 1 ) {
				denominator = denominator + _rateWeightM[_l][1]*Exp(binomialP ( _rateWeightM[_l][0], total, choose ));
			}
			
			for ( _l = 0; _l < numRates; _l = _l + 1 ) {
				SQLString = "";
				SQLString * 128;
				SQLString * ( "INSERT INTO " + NEB_TABLE + " VALUES ('" + (_siteInfo[_k])["MDR_SITE"] + "', '" + (_siteInfo[_k])["SITE_GENE_START"] + "', '" + (_siteInfo[_k])["COVERAGE"] + "', '" + (_siteInfo[_k])["RESISTANCE"] + "', '" +  _l + "', '" + _rateWeightM[_l][0] + "', '" + _rateWeightM[_l][1] + "', '" + ((Exp(binomialP ( _rateWeightM[_l][0], total, choose ))*(_rateWeightM[_l][1]))/denominator) + "');" );
				SQLString * 0;
				DoSQL ( ANALYSIS_DB_ID, SQLString, "" );  
			}
		}
		
	}
	else { /*consider all non-consensus mutations*/
		
		_recordsFound = {};
		DoSQL ( ANALYSIS_DB_ID, "SELECT SITE,COVERAGE,CONSENSUS FROM " + MU_RATE_TABLE + ";", "return _matchRecordsByField(1);" );
		_siteInfo = _recordsFound;
		
		tableInfo = {};
		tableInfo["SITE"]			= "INTEGER";
		tableInfo["COVERAGE"]		= "INTEGER";
		tableInfo["CONSENSUS"]		= "INTEGER";
		tableInfo["RATE_CLASS"]		= "INTEGER";
		tableInfo["RATE"]			= "REAL";
		tableInfo["WEIGHT"]			= "REAL";
		tableInfo["POSTERIOR"]		= "REAL";
		_CheckDBID ( ANALYSIS_DB_ID, NEB_TABLE, tableInfo );
		
		
		for ( _k = 0; _k < Abs ( _siteInfo ); _k = _k + 1 ) {
			total = 0 + (_siteInfo[_k])["COVERAGE"];
			choose = total - ( 0 + (_siteInfo[_k])["CONSENSUS"]);
			
			denominator = 0;
			for ( _l = 0; _l < numRates; _l = _l + 1 ) {
				denominator = denominator + _rateWeightM[_l][1]*Exp(binomialP ( _rateWeightM[_l][0], total, choose ));
			}
			
			for ( _l = 0; _l < numRates; _l = _l + 1 ) {
				SQLString = "";
				SQLString * 128;
				SQLString * ( "INSERT INTO " + NEB_TABLE + " VALUES ('" + (_siteInfo[_k])["SITE"] + "', '"  + (_siteInfo[_k])["COVERAGE"] + "', '" + (_siteInfo[_k])["CONSENSUS"] + "', '" +  _l + "', '" + _rateWeightM[_l][0] + "', '" + _rateWeightM[_l][1] + "', '" + ((Exp(binomialP ( _rateWeightM[_l][0], total, choose ))*(_rateWeightM[_l][1]))/denominator) + "');" );
				SQLString * 0;
				DoSQL ( ANALYSIS_DB_ID, SQLString, "" );  
			}
		}
	}
}
DoSQL ( SQL_CLOSE, "", ANALYSIS_DB_ID );




function computeABinomialCoefficient (n,k)
{
	key = "" + n + ";" + k;
	if (binomialCoefficients[key] != 0)
	{
		return binomialCoefficients[key];
	}
	
	res = 0;
	res :< 1e300;
	for (_s = k; _s > 0; _s = _s-1)
	{
		res = res + Log (n / _s);
		n = n-1;
	}
	
	binomialCoefficients[key] = res;
	return res;
}


function binomialP (p,n,k)
{
	if (p == 0)
	{
		if (k > 0)
		{
			return -1e100;
		}
		else
		{
			return 0;
		}
	}
	return computeABinomialCoefficient (n,k) + k*Log(p) + (n-k)*Log(1-p);
}