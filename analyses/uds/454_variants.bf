BINOMIAL_TABLE = "MU_RATE_CLASSES";
MU_RATE_TABLE = "SITE_MU_RATES";
NEB_TABLE = "SITE_POSTERIORS";
UPDATESQL = 1;

ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"GrabBag.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DescriptiveStatistics.bf");
ExecuteAFile					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"HXB2Mapper.bf");

binomialCoefficients = {};

SetDialogPrompt 		("454 run database file:");

ANALYSIS_DB_ID			= _openCacheDB ("");
DB_FILE_PATH 			= LAST_FILE_PATH;
haveTable				= _TableExists (ANALYSIS_DB_ID, "AA_ALIGNMENT");

fprintf					(stdout, "Minimum coverage required for analysis at a site:" );
fscanf					(stdin,"Number", coverageThreshold);

if (!haveTable)
{
	fprintf (stdout, "[ERROR: NO AA_ALIGNMENT TABLE IN ", DB_FILE_PATH, "]\n");
	return 0;
}

tableInfo = {};
tableInfo["NUM_RATES"] 	= "INTEGER";
tableInfo["RATE_CLASS"] = "INTEGER";
tableInfo["MU_RATE"] 	= "REAL";
tableInfo["WEIGHT"] 	= "REAL";
tableInfo["LOG_LK"] 	= "REAL";
tableInfo["AIC"] 		= "REAL";
_CheckDBID ( ANALYSIS_DB_ID, BINOMIAL_TABLE, tableInfo );


tableInfo = {};
tableInfo["SITE"]			= "INTEGER";
tableInfo["COVERAGE"]		= "INTEGER";
tableInfo["CONSENSUS"]		= "INTEGER";
tableInfo["ENTROPY"]		= "REAL";
tableInfo["MU"]				= "REAL";
tableInfo["MU_RNK_PRCNT"] 	= "REAL";
_CheckDBID ( ANALYSIS_DB_ID, MU_RATE_TABLE, tableInfo );

refAA      = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT REFERENCE AS REF FROM SETTINGS");
_codonToAA = defineCodonToAA();
refAA      = translateCodonToAA ((refAA[0])["REF"],_codonToAA,0);


sitesWithCoverage = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT POSITION FROM AA_ALIGNMENT WHERE COVERAGE >= " + coverageThreshold);

if ( Abs ( sitesWithCoverage ) > 0 ) {
		
	keys = Rows (sitesWithCoverage);
	siteCount = Abs (sitesWithCoverage);
	
	for (k = 0; k < siteCount ; k = k+1)
	{
		newKey = _mapNumberToString (0+keys[k]);
		if (keys[k] != newKey)
		{
			sitesWithCoverage[newKey] = sitesWithCoverage[keys[k]];
			sitesWithCoverage - keys[k];
		}
	}
	/*fprintf ( stdout, sitesWithCoverage, "\n" );*/
	
	mutationRate 			 = {Abs(sitesWithCoverage),5}["_MATRIX_ELEMENT_ROW_"];
	
	counter					 = 0;
	sitesWithCoverage		 ["iterateList"][""];
	
	counts					 = {siteCount, 3};
	
	for (k = 0; k < siteCount ; k = k+1)
	{
		counts[k][0] = mutationRate[k][4]; /*total coverage at site*/
		counts[k][1] = mutationRate[k][3] - mutationRate[k][4]; /*total coverage - consensus aa */
		counts[k][2] = computeABinomialCoefficient (counts[k][0]+counts[k][1],counts[k][1]);
	}
	
	
	//fprintf ( stdout, counts, "\n" );
	
	global P_1 = 0.5;
	P_1 :< 0.99999999; P_1 :> 0.00000001;
	
	
	fprintf (stdout, "\nEstimating mutation rates\n");
		
	Optimize (resN, jointBinomialP (P_1));
	
	AIC = -resN[1][0]*2 + 2;
	
	fprintf (stdout, "Single rate = ", P_1, ", Log L = ", resN[1][0], ", AIC = ", AIC, "\n");
	
	if ( UPDATESQL ) {
		DoSQL ( ANALYSIS_DB_ID, "INSERT INTO " + BINOMIAL_TABLE + " VALUES ('1', '1', '" + P_1 + "', '1.0', '" + resN[1][0] + "', '" + AIC + "')", "" );
	}
	
	for (rateCount = 2; rateCount < 10; rateCount += 1)
	{
		thisRate           = "P_" + rateCount;
		ExecuteCommands    ("global `thisRate` = 0.1; `thisRate` :< 0.99999999; `thisRate` :> 0.00000001;");
		generate_gdd_freqs (rateCount, "freqs", "discard", "M", 0);
		
		parameterMx = {rateCount, 2};
		
		for (aRate = 0; aRate < rateCount; aRate += 1)
		{
			ExecuteCommands ("parameterMx[aRate][0] := P_" + (aRate+1) +";\n");
			ExecuteCommands ("parameterMx[aRate][1] := "+freqs[aRate]+";\n");
		}
		
		VERBOSITY_LEVEL = 0;
		Optimize (res2, jointBinomialMulti (parameterMx));
		
		disAIC = -res2[1][0]*2 + 4*rateCount;
		
		fprintf (stdout, "\n", rateCount, " rates\n",
		"Log (L) = ", res2[1][0], " AIC = ", disAIC);
		
		for (aRate = 0; aRate < rateCount; aRate += 1)
		{
			fprintf (stdout, "\n\tClass ", aRate+1, ".",
			"\n\t\tRate   = ", Format(Eval("P_" + (aRate+1)),8,5),
			"\n\t\tWeight = ",Format(Eval(freqs[aRate]),8,5));
			
			if ( UPDATESQL ) {
				DoSQL ( ANALYSIS_DB_ID, "INSERT INTO " + BINOMIAL_TABLE + " VALUES ('" + rateCount + "', '" + (aRate + 1) + "', '" + Format(Eval("P_" + (aRate+1)),8,5) + "', '" + Format(Eval(freqs[aRate]),8,5) + "', '" + res2[1][0] + "', '" + disAIC + "')", "" );
			}
			
		}
		
		/*fprintf ( stdout, "\nrateCount = ", rateCount, "; disAIC = ", disAIC, "; AIC = ", AIC, "\n" );*/
		
		if (disAIC > AIC)
		{
			break;
		}
		AIC = disAIC;
		
	}
	
	fprintf (stdout, "\n\n");
	
	mutationRate			 = mutationRate % 0;
	
	ranks					 = rankMatrix (mutationRate[-1][0]);
	mutationRate			 = mutationRate["ranks[_MATRIX_ELEMENT_ROW_]"]["_MATRIX_ELEMENT_COLUMN_==0"];
	mutationRate			 = mutationRate % 1;
	
	mutationRates			 = {};
	factor					 = 100/(Abs(sitesWithCoverage)-1);
	
	for (k = 0; k < Rows (mutationRate); k = k+1)
	{
		mutationRates[mutationRate[k][1]] = Format(factor*mutationRate[k][0],4,2);
	}
	
	/*fprintf ( stdout,sitesWithCoverage, "\n" );*/
	
	sitesWithCoverage["updateSiteMutationRates"][""];
	
}

DoSQL ( SQL_CLOSE, "", ANALYSIS_DB_ID );


/*---------------------------------------------------------------------*/

function rankMatrix (matrix)
{
	lastValue				   			 = matrix[0];
	lastIndex				   			 = 0;
	matrix							 [0] = 0;
	
	sampleCount = Rows (matrix);
	
	for (_i = 1; _i < sampleCount; _i = _i+1)
	{
		if (lastValue != matrix[_i])
		{
			meanIndex = _i - lastIndex;
			lastValue = matrix[_i];
			if (meanIndex > 1)
			{
				meanIndex = (lastIndex + _i - 1) * meanIndex / (2 * meanIndex);
				for (_j = lastIndex; _j < _i; _j = _j + 1)
				{
					matrix[_j] = meanIndex;
				}
			}
			matrix[_i] = _i;
			lastIndex = _i;
		}
	}
	
	meanIndex = _i - lastIndex;
	if (meanIndex > 1)
	{
		meanIndex = (lastIndex + _i - 1) * meanIndex / (2 * meanIndex);
		for (_j = lastIndex; _j < _i; _j = _j + 1)
		{
			matrix[_j] = meanIndex;
		}
	}
	else
	{
		matrix[_i-1] = _i - 1;
	}
	return matrix;
}

/*---------------------------------------------------------------------*/
function updateSiteMutationRates (key,value)
{
	siteID = value["POSITION"];
	result = retriveAASpectrumForSite (siteID);
	if ( UPDATESQL ) {
		SQLString = "";
		SQLString * 128;
		SQLString * ( "INSERT INTO " + MU_RATE_TABLE + " VALUES ('" + (siteID) + "', '" + result[0] + "', '" ); 
		SQLString * ( "" + result[3] + "', '" + result[1] + "', '" + result[2] + "', '" + mutationRates[siteID] + "')" );
		SQLString * 0;
		
		/*fprintf ( stdout, SQLString, "\n" );*/
		
		DoSQL ( ANALYSIS_DB_ID, SQLString, "" );
	}
	return 0;
}

/*---------------------------------------------------------------------*/



function iterateList (key,value)
{
	siteID = value["POSITION"];
	result = retriveAASpectrumForSite (siteID);	
	mutationRate [counter][0] = result[2]; /*percent non-consensus at site*/
	mutationRate [counter][1] = 0 + siteID;
	mutationRate [counter][3] = result[0]; /*total coverage at site */
	mutationRate [counter][4] = result[3]; /*number of consesus aa at site*/
	
	/*fprintf ( stdout, mutationRate[counter][0], " ", mutationRate[counter][1], " ", mutationRate[counter][3], " ", mutationRate[counter][4], "\n" );*/
	
	counter = counter + 1;
	return 0;
}

/*---------------------------------------------------------------------*/

function merge (key,value)
{
	if (Abs(positionList[key])==0)
	{
		positionList[key] = value;
	}
	return 0;
}

/*---------------------------------------------------------------------*/

function entropyC (key, value)
{
	entropy = entropy - (0+value)/total * Log ((0+value)/total);
	return 0;
}

/*---------------------------------------------------------------------*/

function retriveAASpectrumForSite (site)
{
	spectrum  = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT * FROM AA_ALIGNMENT WHERE POSITION = " + site);

	if (Abs(spectrum) == 0 )
	{
		return {};
	}
	return retriveAASpectrumForSiteAux (spectrum[0]);
}


/*---------------------------------------------------------------------*/

function retriveAASpectrumForSiteAux (spectrum)
{
	referenceAA   = _codonToAA[spectrum["REFERENCE"]];	
	consensusAA   = _codonToAA[spectrum["CONSENSUS"]];	
		
	total	  	  = 0 + spectrum["COVERAGE"];
	
	codons        = Rows (_codonToAA);
	byResidue     = {};
	consensus 	  = 0;
	entropy		  = 0;
	
	for (cc = 0; cc < 64; cc = cc+1)
	{
		_aa    = _codonToAA[codons[cc]];
	    _count = (0+spectrum[codons[cc]]);
	    if (_count > 0)
	    {
			byResidue [_aa] = byResidue [_aa] + _count;
			if (_aa == consensusAA)
			{
				consensus = consensus + _count;
			}
		}
	}
	
	if (Abs (byResidue))
	{
		byResidue ["entropyC"][""];
	}
	
	return {{total__,entropy__/Log(2),(total__-consensus__)/total__,consensus__}};
	/*         0            1                     2                     3 */
}


/*---------------------------------------------------------------------*/

function jointBinomialP (p)
{
	row_dim = Rows(counts);
	logLByRateClass = {row_dim, 1}["counts[_MATRIX_ELEMENT_ROW_][2]+counts[_MATRIX_ELEMENT_ROW_][1]*Log(p)+counts[_MATRIX_ELEMENT_ROW_][0]*Log(1-p)"]; 
	return +logLByRateClass;
}

/*---------------------------------------------------------------------*/


function jointBinomialMulti (rates)
{
	LL = 0;
	row_dim = Rows(counts);
	col_dim = Rows(rates);
	
	logLByRateClass = {row_dim, col_dim}["counts[_MATRIX_ELEMENT_ROW_][2]+counts[_MATRIX_ELEMENT_ROW_][1]*Log(rates[_MATRIX_ELEMENT_COLUMN_][0])+counts[_MATRIX_ELEMENT_ROW_][0]*Log(1-rates[_MATRIX_ELEMENT_COLUMN_][0])"]; 
    logLByRateClassE = logLByRateClass ["Exp(_MATRIX_ELEMENT_VALUE_)"] * (rates[-1][1]);
    hazZeros        = logLByRateClassE["_MATRIX_ELEMENT_VALUE_==0"];
    
    correction      = 0;
    
    if (+hazZeros) {
        for (k = 0; k < row_dim; k += 1) {
            if (hazZeros [k]) {
                //fprintf (stdout, logLByRateClass[k][-1], "\n");
                maxV = -1e100;
                for (k2 = 0; k2 < col_dim; k2 += 1) {
                    maxV = Max (maxV, logLByRateClass[k][k2]);
                }
                maxV = -maxV;
                correction += maxV;
                logLByRateClassE[k] = (((logLByRateClass[k][-1])["Exp(maxV+_MATRIX_ELEMENT_VALUE_)"])*(rates[-1][1]))[0];        
            }
        }
    }
 	
	
	LL = (+logLByRateClassE["Log(_MATRIX_ELEMENT_VALUE_)"]) - correction;
    return LL;
}

/*---------------------------------------------------------------------*/

function binomialP (p,n,k,c)
{
	/*if (p == 0)
	{
		if (k > 0)
		{
			return -1e100;
		}
		else
		{
			return 0;
		}
	}*/
	return c + k*Log(p) + (n-k)*Log(1-p);
}

/*---------------------------------------------------------------------*/

function computeABinomialCoefficient (n,k)
{
	key = "" + n + ";" + k;
	if (binomialCoefficients[key] != 0)
	{
		return binomialCoefficients[key];
	}
	
	_auxMx = {k,1};
	res = +(_auxMx["Log((n__-_MATRIX_ELEMENT_ROW_)/(k__-_MATRIX_ELEMENT_ROW_))"]);
	
	binomialCoefficients[key] = res;
	return res;
}
