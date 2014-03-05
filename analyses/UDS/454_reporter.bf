ExecuteAFile 					("../Shared/GrabBag.bf");
ExecuteAFile 					("../Shared/DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"PS_Plotters.bf");
ExecuteAFile 					("../Shared/DescriptiveStatistics.bf");
ExecuteAFile 					("../Shared/NJ.bf");
ExecuteAFile					("../Shared/nucleotide_options.def");

AALetters						= "ACDEFGHIKLMNPQRSTVWY?-";
NucLetters						= "ACGT-N";
AAMap							= {};
for (k = 0; k < Abs (AALetters); k=k+1)
{
	AAMap[AALetters[k]] = k;
}

alignOptions = {};

SetDialogPrompt 		("454 run database file:");
ANALYSIS_DB_ID			= _openCacheDB ("");

DB_FILE_PATH 			= LAST_FILE_PATH;

haveTable				= _TableExists (ANALYSIS_DB_ID, "NUC_ALIGNMENT");
idx_to_res 				= {{"A","C","G","T","-","N"}};



if (haveTable)
{
	/*
	fprintf					(stdout, "Filtering sequence [blank to use all positions] :");
	fscanf					(stdin, "String", filterString);
	*/
	filterString = "";
	
	refStr		= ((_ExecuteSQL (ANALYSIS_DB_ID,"SELECT REFERENCE_PASS2 FROM SETTINGS"))[0])["REFERENCE_PASS2"];
	filterString = (filterString&&1)^{{"[^A-Z]"}{""}};
	if (Abs (filterString))
	{
		inStr 		= {{refStr,filterString}};
		AlignSequences(aligned, inStr, alignOptions_p2);
		aligned	   = aligned[0];
		offsets    = computeCorrection (aligned[2]);
		offsets[1] = Abs(aligned[2])-offsets[1]-1;
		
		fromS = offsets[0] + 1;
		uptoS = offsets[0] + Abs(((aligned[1])[offsets[0]][offsets[1]])^{{"[^ACGT]",""}});
		
		positionClause = " WHERE POSITION >=" + (fromS) + " AND POSITION <= " + (uptoS);
		fprintf (stdout, positionClause,aligned);
	}
	else
	{
		positionClause = "";
	}
		
	coverageInfo 			= _ExecuteSQL (ANALYSIS_DB_ID, "SELECT SPAN_PASS2 FROM SEQUENCES WHERE SPAN_PASS2 > 0");
	storageArray	 		= {};
	FIELD_NAME				= "SPAN_PASS2";
	recCount		 		= coverageInfo["extractAField"][""];
	coverage_distro			= avlToMatrix		 ("storageArray");
	c_stats			 		= GatherDescriptiveStats (coverage_distro);
	PrintDescriptiveStats 	  ("Distribution of read lengths:", c_stats);

	if (Abs (positionClause))
	{
		coverageInfo 			= _ExecuteSQL (ANALYSIS_DB_ID, "SELECT COVERAGE FROM NUC_ALIGNMENT " + positionClause + " AND INDEL_POSITION = 0 ORDER BY POSITION");
	}
	else
	{
		coverageInfo 			= _ExecuteSQL (ANALYSIS_DB_ID, "SELECT COVERAGE FROM NUC_ALIGNMENT WHERE INDEL_POSITION = 0 ORDER BY POSITION");	
	}
	storageArray	 		= {};
	FIELD_NAME 		 		= "COVERAGE";
	recCount		 		= coverageInfo["extractAField"][""];
	coverage_distro			= avlToMatrix		 ("storageArray");
	c_stats			 		= GatherDescriptiveStats (coverage_distro);
	
	PrintDescriptiveStats 	  ("Distribution of position coverage:", c_stats);
	
	columnHeaders = {{"Coverage"}};
	
	OpenWindow (CHARTWINDOW,{{"Coverage Information"}
		{"columnHeaders"}
		{"coverage_distro"}
		{"Bar Chart"}
		{"Index"}
		{"Coverage"}
		{"Reference, bp"}
		{""}
		{"Coverage"}
		{"0"}
		{""}
		{"-1;-1"}
		{"10;1.309;0.785398"}
		{"Times:12:0;Times:10:0;Helvetica:18:2"}
		{"0;0;16777215;3355443;0;0;6579300;11842740;13158600;14474460;0;3947580;16777215;5000268;6845928;16771158;2984993;9199669;7018159;1460610;16748822;11184810;14173291"}
		{"16,0,0"}
		},
		"1116;1006;692;83");
		
	totalPoints = Rows (coverage_distro);	
	covArray    = {totalPoints,2}["(_MATRIX_ELEMENT_ROW_+1)*(_MATRIX_ELEMENT_COLUMN_==0)+(_MATRIX_ELEMENT_COLUMN_==1)*coverage_distro[_MATRIX_ELEMENT_ROW_]"];
	
	plotPath	= DB_FILE_PATH + "_coverage.ps";
	fprintf (plotPath,CLEAR_FILE,
				SimpleGraph("covArray", {{1,totalPoints__}{0,1}}, "TimesNewRoman", {{300,300,12,0}}, {{0,0,0}}, {{"","Reference Position, bp", "Coverage"}},{{"","IMPULSE"}},1));
	

	minorityResidues		= {};
	majorityResidues		= {};
	entropy					= {};

	fprintf ( stdout, "Minimum coverage needed to include in a majority freq calculation?" );
	fscanf ( stdin, "Number", majority_thresh );
	/*majority_thresh = prompt_for_a_value ("Minimum coverage needed to include in a majority freq calculation?",500,0,100000,0);*/
	
	if (Abs(positionClause))
	{
		qq = positionClause + " AND COVERAGE > " + majority_thresh;
	}
	else
	{
		qq = " WHERE COVERAGE > " + majority_thresh;
	}

	coverage_distro = coverage_distro["100"];
	DoSQL (ANALYSIS_DB_ID, "SELECT POSITION,A,C,G,T,DEL,AMBIG FROM NUC_ALIGNMENT" + qq, "return extractFrequencySpectrum();");
	

	columnHeaders = {{"Majority residue proportion"}};
	
	OpenWindow (CHARTWINDOW,{{"Majority residue"}
		{"columnHeaders"}
		{"coverage_distro"}
		{"Bar Chart"}
		{"Index"}
		{columnHeaders[0]}
		{"Reference, bp"}
		{""}
		{"Majority residue proportion"}
		{"0"}
		{""}
		{"-1;-1"}
		{"10;1.309;0.785398"}
		{"Times:12:0;Times:10:0;Helvetica:18:2"}
		{"0;0;16777215;3355443;0;0;6579300;11842740;13158600;14474460;0;3947580;16777215;5000268;6845928;16771158;2984993;9199669;7018159;1460610;16748822;11184810;14173291"}
		{"16,0,0"}
		},
		"1116;1006;692;83");
		
	covArray    = {totalPoints,2}["(_MATRIX_ELEMENT_ROW_+1)*(_MATRIX_ELEMENT_COLUMN_==0)+(_MATRIX_ELEMENT_COLUMN_==1)*coverage_distro[_MATRIX_ELEMENT_ROW_]"];
	plotPath	= DB_FILE_PATH + "_majority.ps";
	fprintf (plotPath,CLEAR_FILE,
				SimpleGraph("covArray", {{1,totalPoints__}{0,1}}, "TimesNewRoman", {{300,300,12,0}}, {{1,0,0}}, {{"","Reference Position, bp", "Majority Proportion"}},{{"",""}},1));

	stats			 		= GatherDescriptiveStats (avlToMatrix		 ("majorityResidues"));
	PrintDescriptiveStats 	  ("Distribution of majority coverage:", stats);
	stats			 		= GatherDescriptiveStats (avlToMatrix		 ("minorityResidues"));
	PrintDescriptiveStats 	  ("Distribution of minority coverage as the proportion of majority:", stats);
		
	/*thresh = prompt_for_a_value ("Report positions with this much minor variant?",0.05,0,1,thresh);*/

	seq_maj = ""; seq_maj * 128;
	seq_min = ""; seq_min * 128;
	csv		= ""; csv     * 128;
	
	csv * "Consensus";
	for (k = 0; k < Columns(idx_to_res); k=k+1)
	{
		csv * ("," + idx_to_res[k]);
	}
	
	if (Abs(positionClause))
	{		
		DoSQL (ANALYSIS_DB_ID, "SELECT POSITION,A,C,G,T,DEL,AMBIG FROM NUC_ALIGNMENT " + positionClause + " AND INDEL_POSITION == 0 AND COVERAGE >= " + majority_thresh + " ORDER BY POSITION ", "return printFrequencySpectrum(0.005);");
	}
	else
	{
		DoSQL (ANALYSIS_DB_ID, "SELECT POSITION,A,C,G,T,DEL,AMBIG FROM NUC_ALIGNMENT WHERE COVERAGE >= " + majority_thresh + "  AND INDEL_POSITION == 0 ORDER BY POSITION ", "return printFrequencySpectrum(0.005);");
	}
	
	
	seq_maj * 0;
	seq_min * 0;
	csv     * 0;
	
	/*
	DataSet 	  ds 		   = ReadFromString(">CONSENSUS\n" + seq_maj+ "\n>MINORITY\n"+ seq_min+ "\n");
	DataSetFilter filteredData = CreateFilter  (ds,1);  
	InitializeDistances (0);
	fprintf (stdout, "Maximum pairwise distance :", ComputeDistanceFormula (0,1)*100, "%\n");
	*/
	
	return 0;
	
	SetDialogPrompt ("Save position by position report to ");
	fprintf (PROMPT_FOR_FILE, CLEAR_FILE, csv);


	
	if (Abs(positionClause))
	{
		completeStrings = _ExecuteSQL (ANALYSIS_DB_ID, "SELECT SEQUENCE_ID, NUC_PASS2,REF_PASS2,OFFSET_PASS2,SPAN_PASS2 FROM SEQUENCES WHERE OFFSET_PASS2 <= " + fromS + " AND OFFSET_PASS2 + SPAN_PASS2 >= " + uptoS);
		SetDialogPrompt ("Write sequences to: ");
		fprintf (PROMPT_FOR_FILE, CLEAR_FILE, KEEP_OPEN, ">query\n", filterString);
		for (k=0; k<Abs(completeStrings); k=k+1)
		{
			refString = (completeStrings[k])["NUC_PASS2"];
			offset_counter = 0 + (completeStrings[k])["OFFSET_PASS2"];
			rsl = Abs (refString);
			for (k2 = 0; k2 < rsl; k2=k2+1)
			{
				if (refString[k2] != "-")
				{
					offset_counter = offset_counter + 1;
					if (offset_counter >= fromS)
					{
						break;
					}
				}
			}
			si = k2;
			for (k2 = k2+1; k2 < rsl; k2=k2+1)
			{
				if (refString[k2] != "-")
				{
					offset_counter = offset_counter + 1;
					if (offset_counter >= uptoS)
					{
						break;
					}					
				}
			}
			k2 = Min(k2,rsl-1);
			fprintf (LAST_FILE_PATH, "\n>", (completeStrings[k])["SEQUENCE_ID"], "\n", ((completeStrings[k])["NUC_PASS2"])[si][k2]);
		}
		fprintf (LAST_FILE_PATH, CLOSE_FILE);
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
	storageArray [0+key] = 0+value[FIELD_NAME];
	return 0;
}


/*-------------------------------------------------*/

function extractFrequencySpectrum ()
{
	max  = 0; ind  = 0;
	max2 = 0; ind2 = 0;
	cols = Columns (SQL_ROW_DATA);

	m2 = {};
	sum = 0;
	for (k = 1; k < cols; k=k+1)
	{
		v = 0 + SQL_ROW_DATA[k];
		if (v>0)
		{
			m2[Abs(m2)] = v;
		}
		sum = sum+v;
		if (v > max)
		{
			max2 = max; ind2 = ind;
			max = v;    ind = k-1;
		}
	}
	if (Abs(m2))
	{
		m = Transpose(avlToMatrix("m2"));
		sum = (m*Transpose(m["1"]))[0];
		m = m * (1/sum);
		ent = - m*Transpose(Log(m)*(1/Log(2)));
		
		
	    pos_idx =  0+SQL_ROW_DATA[0];
	    coverage_distro[pos_idx-1] = max/sum*100;
		minorityResidues [pos_idx] = max2/max;
		majorityResidues [pos_idx] = max;
		entropy			 [pos_idx] = ent[0];
	}
	return 0;
}

/*-------------------------------------------------*/

function printFrequencySpectrum (min_t)
{
	max  = 0; ind  = 0;
	max2 = 0; ind2 = 0;
	cols = Columns (SQL_ROW_DATA);
	
	sum  = 0;
	
	for (k = 0; k < cols-1; k=k+1)
	{
		v = 0 + SQL_ROW_DATA[k+1];
		if (v > max)
		{
			max2 = max; ind2 = ind;
			max = v;    ind = k;
		}
		else
		{
			if (v>max2)
			{
				max2 = v; ind2 = k;
			}
		}
		sum = sum + v;
	}
	
	csv * "\n";
	csv * idx_to_res[ind];
	for (k = 0; k < cols-1; k=k+1)
	{
		v = 0 + SQL_ROW_DATA[k+1];
		csv * (","+v);
	}

	seq_maj * idx_to_res[ind];
	if (max2/max >= min_t)
	{
		seq_min * idx_to_res[ind2];
	}
	else
	{
		seq_min * idx_to_res[ind];
	}
	return 0;
}

/*-------------------------------------------------*/

function report_consensus (indel_rate)
{
	
	return 0;
}
