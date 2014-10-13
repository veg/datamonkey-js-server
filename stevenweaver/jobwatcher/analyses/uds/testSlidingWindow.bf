ExecuteAFile 					("../Shared/GrabBag.bf");
ExecuteAFile 					("../Shared/DBTools.ibf");
ExecuteAFile 					("../Shared/DescriptiveStatistics.bf");
ExecuteAFile					("../Shared/nucleotide_options.def");


ALLOWED_INDEL_PROPORTION = 0.25;
AALetters						= "ACDEFGHIKLMNPQRSTVWY?-";
NucLetters						= "ACGT-N";
AAMap							= {};
for (k = 0; k < Abs (AALetters); k=k+1)
{
	AAMap[AALetters[k]] = k;
}

alignOptions = {};

DB_FILE_PATH  = "/home/datamonkey/Datamonkey/Analyses/UDS/spool/upload.6902046329939.1_uds.env.cache";
ANALYSIS_DB_ID			= _openCacheDB (DB_FILE_PATH);

geneticCodeTable		= 0;
aaScoreString			= "HIV_5";
tableName				= "NUC_ALIGNMENT";
fromP					= 251;
toP						= 375;
threshold				= 5;

haveTable				= _TableExists (ANALYSIS_DB_ID, tableName);

if ( haveTable )
{
	max_position   = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT MAX(POSITION) AS MX FROM " + tableName);
	max_position   = 0+(max_position[0])["MX"];
	
	rawSQL			  = "SELECT OFFSET, NUC_PASS2,REF_PASS2,OFFSET_PASS2 FROM SEQUENCES,SETTINGS WHERE OFFSET_PASS2 <= " + fromP + " AND SPAN_PASS2+OFFSET_PASS2 > " + toP;
	matchingSequences =  _ExecuteSQL (ANALYSIS_DB_ID, rawSQL);
	
	binner       = {};
	codon_binner = {};
	variantCount	   = Abs (matchingSequences);
	
	for (k = 0; k<variantCount; k=k+1)
	{
		qStr = (matchingSequences[k])["NUC_PASS2"];
		rStr = (matchingSequences[k])["REF_PASS2"];		
		span = extractRegionBasedOnReference (rStr, fromP, toP, 0+(matchingSequences[k])["OFFSET_PASS2"]);
		
		cStr2 = qStr[span[0]][span[1]];
		binner [cStr2] = binner[cStr2] + 1;
		/*isgaps 	= (cStr2 $ "^\\-+$")[0]>=0;
		if (isgaps)
		{
			fprintf (stdout, ">ref\n",rStr, "\n>qry\n", qStr, "\n\n");
		}*/
	}
	totalVariants	   = Abs (binner);

	fprintf			   (stdout, "Found ", totalVariants, " variants among ", variantCount, " sequences\n");
	fprintf			   (stdout, "Excluding all variants with fewer than ", threshold, " copies\n");
	
	retained		   = {};
	variants		   = Rows (binner);
	threshold		   = Max(threshold, minCopyCount);
	for (k = 0; k < totalVariants; k = k+1)
	{
		seq = variants[k];
		
		indelPos = seq||"-";
		indelCount = Rows(indelPos)$2;
		indelProp = indelCount/Abs(seq);
		
		fprintf ( stdout, "****************** Checking for indels ******************\n" );
		fprintf ( stdout, "da sequence : ", seq, "\n" );
		fprintf ( stdout, "daindelcount : ", indelCount, "\n" );
		fprintf ( stdout, "daindelprop : ", indelProp, "\n" );		
		
		if (binner[seq] >= threshold && indelProp < ALLOWED_INDEL_PROPORTION )
		{
			fprintf ( stdout, "kept this sequence\n" );
			retained [k] = binner[seq];
		}
		fprintf ( stdout, "****************** Checking for indels ******************\n" );
	}
	retainedVariants = Abs (retained);
	retainedIndices	 = Rows (retained);
	toSort = {retainedVariants,2};
	for (k = 0; k < retainedVariants; k=k+1)
	{
		toSort [k][0] = 0+retainedIndices[k];
		toSort [k][1] = retained[retainedIndices[k]];
	}
	toSort = toSort%1;
	
	fprintf 		(stdout, "Retained ", retainedVariants, " variants\n\n");
	
	mleEst = 0;
	if (retainedVariants < 2)
	{
		_closeCacheDB			(ANALYSIS_DB_ID);
		maxDLB	= -2;
		return 0;
	}
	
	fileToPrint = DB_FILE_PATH + ".retained.variants";

	fprintf (fileToPrint, CLEAR_FILE, KEEP_OPEN);
	
	for (k = retainedVariants-1; k>=0; k=k-1)
	{
		fprintf (fileToPrint, ">variant_",(retainedVariants-k),"_",toSort[k][1],"_copies\n", ((variants[toSort[k][0]])^{{"-"}{""}}), "\n");	     
	}

	fprintf (fileToPrint,CLOSE_FILE);
	inFile = fileToPrint;
	alignOptions = {};
	alignOptions ["0"] = "No penalty";
	alignOptions ["1"] = "First in file";
	alignOptions ["2"] = "No";
	alignOptions ["3"] = inFile;
	alignOptions ["4"] = "No";
	alignOptions ["5"] = inFile;
	ExecuteAFile ("../Shared/SeqAlignmentNuc.bf", alignOptions);	
	
	DataSet testDS = ReadDataFile ( inFile );
	DataSetFilter testFilter = CreateFilter ( testDS, 1 );
	GetInformation (testSequences,testFilter );

	
	
	
	
	}
else
{
	fprintf (stdout, "ERROR: NO NUC_ALIGNMENT TABLE IN THIS FILE. PLEASE RERUN 454.bf ON THE .FNA FILE");
	return 0;	
}

/*-------------------------------------------------*/

function ReceiveJobs ( null )	/*Modified from NielsenYang.bf */
{
	
	MPIReceive (-1, fromNode, result_String);
	ExecuteCommands ( result_String );
	
	timer2     = MPINodeState[fromNode-1][1];
	MPINodeState[fromNode-1][0] = 0;
	MPINodeState[fromNode-1][1] = 0;
	
	return fromNode;
}

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

/*-------------------------------------------------*/

function maxPathInATree (treeID)
{
	maxPath = 0;
	ExecuteCommands ("lc=TipCount(`treeID`);tn=TipName(`treeID`,-1)");
	
	if (lc == 2)
	{
		return BranchLength (givenTree,0);
	}
	
	for (l1 = 0; l1 < lc-1; l1 = l1+1)
	{
		for (l2 = l1+1; l2 < lc; l2 = l2+1)
		{
			ExecuteCommands ("bl=BranchLength(`treeID`,\""+tn[l1]+";"+tn[l2]+"\");");
			maxPath = Max(maxPath,bl);
		}
	}
	
	return maxPath;
}
