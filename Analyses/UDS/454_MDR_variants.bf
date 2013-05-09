BINOMIAL_TABLE	= "MU_RATE_CLASSES";
MDR_TABLE		= "MDR_VARIANTS";
MDR_SUMMARY 	= "MDR_SUMMARY";
NEB_TABLE		= "SITE_DR_POSTERIORS";
UPDATESQL = 1;

ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"GrabBag.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DescriptiveStatistics.bf");
ExecuteAFile					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"HXB2Mapper.bf");
ExecuteAFile					("../Shared/ReadScores.bf"); 

SetDialogPrompt 		("454 run database file:");

ANALYSIS_DB_ID			= _openCacheDB ("");
DB_FILE_PATH 			= LAST_FILE_PATH;
haveTable				= _TableExists (ANALYSIS_DB_ID, "AA_ALIGNMENT");

fprintf					(stdout, "Drug resistance threshold to consider a resistance mutation (i.e. minimum Stanford Score)\n" );
fscanf					(stdin,"Number", resistanceThreshold);

fprintf					(stdout, "Minimum coverage to consider a drug resistant site:\n" );
fscanf					(stdin,"Number", coverageThreshold);

SQLString = "";
SQLString * 128;
SQLString * ( "UPDATE SETTINGS SET STANFORD_SCORE='" + resistanceThreshold + "'; UPDATE SETTINGS SET MIN_DR_COVERAGE='" + coverageThreshold + "';" );
SQLString * 0;
DoSQL ( ANALYSIS_DB_ID, SQLString, "" );

if ( DO_PIPELINE ) {
	fscanf					(stdin,"Number", hiv_gene );
}
else {
	ExecuteAFile	("../Shared/hiv_1_ref_sequences.ibf");
	ChoiceList		( hiv_gene,"Choose a reference sequence",1,SKIP_NONE,RefSeqNames);
	dagene			= (RefSeqNames[hiv_gene][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}}; 
}


if (!haveTable)
{
	fprintf (stdout, "[ERROR: NO AA_ALIGNMENT TABLE IN ", DB_FILE_PATH, "]\n");
	return 0;
}

tableInfo = {};
tableInfo["MDR_SITE"]			= "INTEGER"; /*index of site as on stanford DB. i.e. from start of rt for NNRTI/NRTI and from pr for PI's */
tableInfo["SITE_GENE_START"]	= "INTEGER"; /*index of site when starting from gene: either pr or rt.*/
tableInfo["DRUG_CLASS"]			= "BLOB";
tableInfo["DRUG_REPORT"]		= "BLOB";
tableInfo["COVERAGE"]			= "INTEGER";
tableInfo["WILDTYPE"]			= "INTEGER";
tableInfo["WILDTYPE_PRCNT"] 	= "REAL";
tableInfo["RESISTANCE"]			= "INTEGER";
tableInfo["RESISTANCE_PRCNT"]	= "REAL";
tableInfo["CI"]					= "BLOB";
tableInfo["OTHER"]				= "INTEGER";
tableInfo["OTHER_PRCNT"]		= "REAL";
tableInfo["ENTROPY"]			= "REAL";
tableInfo["MU"]					= "REAL";
tableInfo["MU_RNK_PRCTL"]		= "REAL";
_CheckDBID ( ANALYSIS_DB_ID, MDR_TABLE, tableInfo );

tableInfo = {};
tableInfo["REF_GENE"]			= "TEXT";
tableInfo["DRUG_CLASS"]			= "TEXT";
tableInfo["MEDIAN_MUT_RNK"]		= "REAL";
tableInfo["P_VALUE"]			= "REAL";
tableInfo["DR_SCORE"]			= "INTEGER";
tableInfo["DR_COVERAGE"]		= "INTEGER";
_CheckDBID ( ANALYSIS_DB_ID, MDR_SUMMARY, tableInfo );

refAA      = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT REFERENCE AS REF FROM SETTINGS");
_codonToAA = defineCodonToAA();
refAA      = translateCodonToAA ((refAA[0])["REF"],_codonToAA,0);
hxb2AA	   = translateCodonToAA(RefSeqs[hiv_gene],_codonToAA,0);

mapper         = mapSequenceToHXB2Aux (refAA, hxb2AA, 1);
reverse_mapper = {};
for (k = 0; k < Rows (mapper); k = k+1)
{
	reverse_mapper[mapper[k]] = k;
}
sitesWithCoverage = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT POSITION FROM AA_ALIGNMENT WHERE COVERAGE >= " + coverageThreshold);
	
fprintf 			     (stdout, "Site\tCoverage\tWildtype\tWildtype %\tResistance\tResistance %\tCofindence Interval %\tOther\tOther %\tEntropy\tMutation rate\tMutation rank percentile\n");
keys = Rows (sitesWithCoverage);
for (k = 0; k < Abs (sitesWithCoverage); k = k+1)
{
	newKey = _mapNumberToString (0+keys[k]);
	if (keys[k] != newKey)
	{
		sitesWithCoverage[newKey] = sitesWithCoverage[keys[k]];
		sitesWithCoverage - keys[k];
	}
}
mutationRate 			 = {Abs(sitesWithCoverage),3}["_MATRIX_ELEMENT_ROW_"];

if ( hiv_gene == 6 || hiv_gene > 10 )  { /* protease only || pol */
	modIDX = 0;
	PI	  = ProcessAFile("../Shared/Scores_PI.txt", resistanceThreshold,modIDX); /*positions indexed from start of protease with no shift*/
	positionList = PI["Scores"];
	gene_string = "PR";
	drugClass	= "PI";
	
	dramSites				 = {};
	counter					 = 0;
	sitesWithCoverage		 ["iterateList"][""]; /*the positions in sites with coverage are indexed by the start of the reference gene */
	
	if (Abs(sitesWithCoverage))
	{
		dummy = doDRMAnalysis ( mutationRate );
	}
	else
	{
		exceed = it;
		it = 1000;
		obsMedian = 0.0;
		fprintf (stdout, "No DRAM sites with sufficient coverage\n");
	}
}

if ( hiv_gene == 7 || hiv_gene > 10 ) {
	if ( hiv_gene == 7 ) {
		modIDX = 0;
	}
	else {
		modIDX = 99;
	}
	NRTI  = ProcessAFile("../Shared/Scores_NRTI.txt", resistanceThreshold,modIDX); /*positions indexed from start of rt with no shift*/
	positionList = NRTI["Scores"];
	gene_string = "RT";	
	drugClass	= "NRTI";
	
	dramSites				 = {};
	counter					 = 0;
	sitesWithCoverage		 ["iterateList"][""]; /*the positions in sites with coverage are indexed by the start of the reference gene */
	
	if (Abs(sitesWithCoverage))
	{
		dummy = doDRMAnalysis ( mutationRate );
	}
	else
	{
		exceed = it;
		it = 1000;
		obsMedian = 0.0;
		fprintf (stdout, "No DRAM sites with sufficient coverage\n");
	}
	
	modIDX = 0;
	NNRTI = ProcessAFile("../Shared/Scores_NNRTI.txt",resistanceThreshold,modIDX); 
	positionList = NNRTI["Scores"];
	gene_string = "RT";	
	drugClass = "NNRTI";
	
	dramSites				 = {};
	counter					 = 0;
	sitesWithCoverage		 ["iterateList"][""]; /*the positions in sites with coverage are indexed by the start of the reference gene */
	
	if (Abs(sitesWithCoverage))
	{
		dummy = doDRMAnalysis ( mutationRate );
	}
	else
	{
		exceed = it;
		it = 1000;
		obsMedian = 0.0;
		fprintf (stdout, "No DRAM sites with sufficient coverage\n");
	}
}

DoSQL ( SQL_CLOSE, "", ANALYSIS_DB_ID );


function doDRMAnalysis ( muRateArray ) {
	
	muRateArray				= muRateArray % 0;
	ranks					= rankMatrix (muRateArray[-1][0]);
	muRateArray				= muRateArray["ranks[_MATRIX_ELEMENT_ROW_]"]["_MATRIX_ELEMENT_COLUMN_==0"];
	muRateArray				= muRateArray % 1;
	
	
	mutationRates			 = {};
	factor					 = 100/(Abs(sitesWithCoverage)-1);
	
	
	for (k = 0; k < Rows (muRateArray); k = k+1)
	{
		mutationRates[muRateArray[k][1]] = Format(factor*muRateArray[k][0],4,2); /*muRateArray[k][1] is siteID from start of reference*/
	}
	
	counter   = 0;
	dramCount = Abs(dramSites);
	dramRanks = {dramCount,1};
	
	/*fprintf ( stdout, dramSites, "\n" );*/
	
	dramSites  ["printDRAM"][""];
	dramRanks = dramRanks%0;
	if (dramCount % 2 == 1)
	{
		obsMedian  = dramRanks[dramCount$2];
	}
	else
	{
		obsMedian  = (dramRanks[dramCount$2] + dramRanks[dramCount$2-1])/2;	
	}
	
	exceed = 0;
	
	for (it = 0; it < 1000; it = it + 1)
	{
		randomRanks = Transpose((Random (Transpose(ranks),1))[{{0,0}}][{{0,dramSites-1}}])%0;
		if (dramCount % 2 == 1)
		{
			randMedian  = randomRanks[dramCount$2];
		}
		else
		{
			randMedian  = (randomRanks[dramCount$2] + randomRanks[dramCount$2-1])/2;	
		}
		exceed = exceed + (randMedian >= obsMedian);
	}
	
	fprintf (stdout, "Observed median mutation rank: ", obsMedian, " (p < ", ((exceed+1)/(it)), ")\n");
	DoSQL ( ANALYSIS_DB_ID, "INSERT INTO " + MDR_SUMMARY + " VALUES ('" + gene_string + "', '" + drugClass + "', '" + obsMedian + "', '" + ((exceed+1)/(it)) + "', '" + resistanceThreshold + "', '" + coverageThreshold + "');", "" );
	
	return 0;
	
}


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
function printDRAM (siteID,result)
{
 
	_idx2 = 0 + siteID;
	_idx1 = _idx2 - modIDX;
 
	dramRanks[counter] = 0+mutationRates[(0+siteID)];
	counter  = counter+1;
	
	
	drugString = "";
	drugString * 128;
	numeroUno = 1;
	for ( _residue = 0; _residue < Abs ( _hyphyAAOrdering ); _residue = _residue + 1 ) {
		ExecuteCommands ( "testResidue = ((" + drugClass + "[\"Scores\"])[\"" + siteID + "\"])[\"" + _hyphyAAOrdering[ _residue ] + "\"];" );
		for ( drug = 0; drug < Rows(testResidue); drug = drug + 1 ) {
			if ( testResidue [ drug ] > 0 ) {
				ExecuteCommands ( "drugName = (" + drugClass + "[\"Names\"])[\"" + drug + "\"];" );
				if ( !numeroUno ) {
					drugString * ( ":" );
				}
				else {
					numeroUno = 0;
				}
				drugString * ( "" + _hyphyAAOrdering[ _residue ] + " " + testResidue[drug] + " " + drugName );
			}
		}
	}
	drugString * 0;
	
	
	fprintf (stdout, _idx1, 
	"\t", _idx2,
	"\t", drugClass,
	"\t", result[0],
	"\t", result[1],
	"\t", Format (result[1]/result[0]*100,4,2),
	"\t", result[2],
	"\t", Format (result[2]/result[0]*100,4,2),
	"\t", Format (result[4]*100,4,2),"-",Format (result[5]*100,4,2),
	"\t", result[3],
	"\t", Format (result[3]/result[0]*100,4,2), 
	"\t", result[6],
	"\t", result[7],
	"\t", mutationRates[(0+siteID)],
	"\n");
	
	if ( UPDATESQL ) {
		SQLString = "";
		SQLString * 128;
		SQLString * ( "INSERT INTO " + MDR_TABLE + " VALUES ('" + _idx1 + "', '" + _idx2 + "', '" + drugClass + "', '" + drugString + "', '" + (result[0]) + "', '" + (result[1]) + "', '" + (Format (result[1]/result[0]*100,4,2)) + "', '" + (result[2]) + "', '" );
		SQLString * ( "" + (Format (result[2]/result[0]*100,4,2)) + "', '" + (Format (result[4]*100,4,2)) + "-" + (Format (result[5]*100,4,2)) + "', '" + (result[3]) + "', '" + (Format (result[3]/result[0]*100,4,2)) + "', '" );
		SQLString * ( "" + (result[6]) + "', '" + (result[7]) + "', '" + (mutationRates[(0+siteID)]) + "')" );
		SQLString * 0;
		DoSQL ( ANALYSIS_DB_ID, SQLString, "" );
	}
	return 0;
}

/*---------------------------------------------------------------------*/



function iterateList (key,value)
{
	/*list being iterated in from AA_ALIGNMENT*/
	siteID = value["POSITION"]; /*from the start of reference gene, can be pol/pr/prrt or rt */
	/*positionList is indexed from the start of the reference gene*/
	resistanceList = positionList[reverse_mapper[siteID]]; /*mapped to start of reference gene in hxb2 */
	if (Abs(resistanceList))
	{
		result = retriveAASpectrumForSite (siteID, resistanceList);
	}
	else
	{
		result = retriveAASpectrumForSite (siteID, {});	
	}
	
	mutationRate [counter][0] = result[7]; /*number of sequences without consensus residue*/
	mutationRate [counter][1] = 0 + siteID; /* siteID from the start of the reference gene*/
	
	counter = counter + 1;
	
	if (Abs(resistanceList) > 0)
	{
		dramSites[siteID] =  result; /*dramSites and sitesWithCoverage will be indexed on the same siteID*/
	}
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

function retriveAASpectrumForSite (site, resistantMutations)
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
	wildtype	  = 0;
	resistance    = 0;
	nonresistance = 0;
	
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
			
			if (Abs(resistantMutations[_aa]) > 0)
			{
				resistance = resistance + _count;
			}
			else
			{
				if (_aa == referenceAA)
				{
					wildtype = wildtype + _count;
				}
				else
				{
					nonresistance = nonresistance + _count;
				}	
			}
		}
	}
	
	
	if (Abs (byResidue))
	{
		byResidue ["entropyC"][""];
	}
	
	bounds = estimateMNCI (resistance,total,3,0.95);
	return {{total__, wildtype__, resistance__, nonresistance__, bounds__[0], bounds__[1], entropy__/Log(2), (total__-consensus__)/total__}};
	/*        0          1          2             3              4           5                 6                          7 */
}

/*---------------------------------------------------------------------*/

function estimateMNCI (n,N,bins,alpha)
{
	FindRoot (A, CChi2(x,bins-1)-alpha, x, 0, 1000);	
	p = n/N;
	upper = (A+2*n+Sqrt(A^2+4*N*A*(1-p)*p))/(2N+2A);
	lower = (A+2*n-Sqrt(A^2+4*N*A*(1-p)*p))/(2N+2A);
	return {{lower__,upper__}};
}

