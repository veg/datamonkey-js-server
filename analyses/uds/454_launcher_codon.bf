/*This is the main launcher for all 454 analyses files. The arguments are provided via the shell script which is called from dispatchAnalysis.pl on datamonkey webserver

	_in_FilePath						: upload.numbers.1
	_in_GeneticCodeTable				: Default Universal Genetic Code since this is a HIV-1 pipeline
	_in_minReadL						: minimum read length for processing
	_in_scoreMatrix						: Alignment score matrix to use
	_in_def_min_coverage
	_in_def_window_span
	_in_def_stride
	_in_def_minCopyCount
	_in_def_nuc_diversity_threshold
	_in_dodr
	_in_def_min_drugscore
	_in_def_min_mdr_coverage
	_in_def_doLong
	_in_def_doCustom


	NOTE: This pipeline uses all local versions of batch files in ../Shared EXCEPT AnalyzeNucProtData.bf and NeighborJoining.bf which are called from 454_sliding_window.bf 
*/


DO_PIPELINE = 1;

ExecuteAFile	("../Shared/globals.ibf");
ExecuteAFile 	("../Shared/GrabBag.bf");
ExecuteAFile 	("../Shared/DBTools.ibf");
ExecuteAFile	("../Shared/alignmentScoreMatrices/matrixlist.ibf" );

uds_timer = Time(1);
RequireVersion  ("0.9920060815");

fscanf			( stdin, "String", _in_FilePath );
fscanf			( stdin, "Number", _in_GeneticCodeTable );
fscanf			( stdin, "Number", _in_minReadL );
fscanf			( stdin, "String", _in_scoreMatrix );
fscanf			( stdin, "Number", _in_def_min_coverage );
fscanf			( stdin, "Number", _in_def_window_span );
fscanf			( stdin, "Number", _in_def_stride );
fscanf			( stdin, "Number", _in_def_minCopyCount );
fscanf			( stdin, "Number", _in_def_nuc_diversity_threshold );
fscanf			( stdin, "Number", _in_dodr );
fscanf			( stdin, "Number", _in_def_min_drugscore );
fscanf			( stdin, "Number", _in_def_min_mdr_coverage );
fscanf			( stdin, "Number", _in_def_doLong );
fscanf			( stdin, "Number", _in_def_doCustom );

GetURL			(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath+".fna.qc.fna");
GetURL			(dataFileConfig,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath+".uds.config");

 /*if _in_def_doLong gene_map is not used, if _in_def_doCustom config file contains taxon names and sequences, for hxb2 config file contains indices of hxb2 reference sequences to use*/
if ( !_in_def_doLong && !_in_def_doCustom ) {
	refOption		= 1;
	ExecuteAFile	("../Shared/hiv_1_ref_sequences.ibf");
	sscanf			(dataFileConfig,"NMatrix",gene_map);
	localRefSeqs = RefSeqs;
	localRefSeqNames = RefSeqNames;
	_do_gene_map = { Rows ( gene_map ), 2 };
	for ( _ak = 0; _ak < Rows ( gene_map ); _ak = _ak + 1 ) {
		_do_gene_map [ _ak ][ 0 ] = gene_map [ _ak ];
		if ( _ak == 7 || _ak > 10 ) {
			_do_gene_map [ _ak ][ 1 ] = 1;
		}
	}
}
else {
	if ( _in_def_doLong ) {
		refOption = 2;
		_do_gene_map = { 1, 2 };
		_do_gene_map [ 0 ][ 0 ] = 1;
		_do_gene_map [ 0 ][ 1 ] = 0; 
		/*doesn't need RefSeqs or RefSeqNames */
		localRefSeqNames = {1,1};
		localRefSeqs = {1,1};
		localRefSeqNames [ _k ][ 0 ] = "longest_read";
		localRefSeqs [ _k ][ 1 ] = "longest_read";
		
	}
	else {
		refOption = 3;
		sscanf			(dataFileConfig,"Matrix",gene_map);
		_do_gene_map = { Rows ( gene_map ), 2 };
		localRefSeqNames = { Rows ( gene_map ), 1 };
		localRefSeqs = { Rows ( gene_map ), 1 };
		for ( _k = 0; _k < Rows ( gene_map ); _k = _k + 1 ) {
			_do_gene_map [ _k ][ 0 ] = 1;
			_do_gene_map [ _k ][ 1 ] = 0;
			localRefSeqNames [ _k ] = gene_map [ _k ][ 0 ];
			localRefSeqs [ _k ] = gene_map [ _k ][ 1 ];
		}
	}	
}

//fprintf ( stdout, "gene_map = ", gene_map, "\n" );


/*do_gene_map: contains a 1 if the gene must be processed and 0 if not for all refOption's 
RefSeqNames: contains names of reference sequences if custom or hxb2 reference genes
RefSeqs: contains the reference sequences if custom or hxb2 reference genes
*/



DataSet unal  = ReadFromString (dataFileString);
DataSetFilter  filteredData 	= CreateFilter	(unal,1);
raw454Sequences.species = filteredData.species;
raw454Sequences.sites	= filteredData.sites;

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalPHP			= baseFilePath + ".out";

fprintf				( finalPHP, CLEAR_FILE );
fprintf				(intermediateHTML, CLEAR_FILE, "<DIV class = 'RepClassSM'><b>Phase 0:</b> Filtering reads based on the reference alignment</DIV>" );

/*PH0: Alignment filtering */
first = 1;
for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
	if ( _do_gene_map [_ak][0] ) {
		if ( refOption == 1 ) {
			dagene		= (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
			dasequence	= localRefSeqs[_ak];
			if ( !first )
			{
				prevgene = (localRefSeqNames[lastgene][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
				daDataFile = baseFilePath + "_uds." + prevgene + ".remaining.fas";
				fscanf ( daDataFile, "Raw", dataFileString );
			}
			else {
				first = 0;
			}
		}
		else {
			if ( refOption == 2 ) {
				dagene = localRefSeqNames[_ak][0];
			}
			else {
				dagene = localRefSeqNames[_ak][0];
				dasequence = (localRefSeqs[_ak]^{{"^[\\?\\-]+"}{""}})^{{"[\\?\\-]+$"}{""}};
				if ( !first ) {
					prevgene = localRefSeqNames[lastgene][0];
					daDataFile = baseFilePath + "_uds." + prevgene + ".remaining.fas";
					fscanf ( daDataFile, "Raw", dataFileString );
				}
				else {
					first = 0;
				}
			}
		}
		fprintf ( intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 0:</b> Filtering ", dagene,"</DIV>" );
		resultDB				= baseFilePath + "_uds." + dagene + ".cache";
		scoreFileString			= "../Shared/alignmentScoreMatrices" + DIRECTORY_SEPARATOR + _in_scoreMatrix;

/*{
"00" : "test.fas",
"01" : "Universal",
"02" : "0.7",
"03" : "test2.db",
"04" : "0",
"06" : "CCTCAGGTCACTCTTTGGCAACGACCCCTCGTCACAATAAAGATAGGGGGGCAACTAAAGGAAGCTCTATTAGATACAGGAGCAGATGATACAGTATTAGAAGAAATGAGTTTGCCAGGAAGATGGAAACCAAAAATGATAGGGGGAATTGGAGGTTTTATCAAAGTAAGACAGTATGATCAGATACTCATAGAAATCTGTGGACATAAAGCTATAGGTACAGTATTAGTAGGACCTACACCTGTCAACATAATTGGAAGAAATCTGTTGACTCAGATTGGTTGCACTTTAAATTTTCCCATTAGCCCTATTGAGACTGTACCAGTAAAATTAAAGCCAGGAATGGATGGCCCAAAAGTTAAACAATGGCCATTGACAGAAGAAAAAATAAAAGCATTAGTAGAAATTTGTACAGAGATGGAAAAGGAAGGGAAAATTTCAAAAATTGGGCCTGAAAATCCATACAATACTCCAGTATTTGCCATAAAGAAAAAAGACAGTACTAAATGGAGAAAATTAGTAGATTTCAGAGAACTTAATAAGAGAACTCAAGACTTCTGGGAAGTTCAATTAGGAATACCACATCCCGCAGGGTTAAAAAAGAAAAAATCAGTAACAGTACTGGATGTGGGTGATGCATATTTTTCAGTTCCCTTAGATGAAGACTTCAGGAAGTATACTGCATTTACCATACCTAGTATAAACAATGAGACACCAGGGATTAGATATCAGTACAATGTGCTTCCACAGGGATGGAAAGGATCACCAGCAATATTCCAAAGTAGCATGACAAAAATCTTAGAGCCTTTTAGAAAACAAAATCCAGACATAGTTATCTATCAATACATGGATGATTTGTATGTAGGATCTGACTTAGAAATAGGGCAGCATAGAACAAAAATAGAGGAGCTGAGACAACATCTGTTGAGGTGGGGACTTACCACACCAGACAAAAAACATCAGAAAGAACCTCCATTCCTTTGGATGGGTTATGAACTCCATCCTGATAAATGGACAGTACAGCCTATAGTGCTGCCAGAAAAAGACAGCTGGACTGTCAATGACATACAGAAGTTAGTGGGGAAATTGAATTGGGCAAGTCAGATTTACCCAGGGATTAAAGTAAGGCAATTATGTAAACTCCTTAGAGGAACCAAAGCACTAACAGAAGTAATACCACTAACAGAAGAAGCAGAGCTAGAACTGGCAGAAAACAGAGAGATTCTAAAAGAACCAGTACATGGAGTGTATTATGACCCATCAAAAGACTTAATAGCAGAAATACAGAAGCAGGGGCAAGGCCAATGGACATATCAAATTTATCAAGAGCCATTTAAAAATCTGAAAACAGGAAAATATGCAAGAATGAGGGGTGCCCACACTAATGATGTAAAACAATTAACAGAGGCAGTGCAAAAAATAACCACAGAAAGCATAGTAATATGGGGAAAGACTCCTAAATTTAAACTGCCCATACAAAAGGAAACATGGGAAACATGGTGGACAGAGTATTGGCAAGCCACCTGGATTCCTGAGTGGGAGTTTGTTAATACCCCTCCCTTAGTGAAATTATGGTACCAGTTAGAGAAAGAACCCATAGTAGGAGCAGAAACCTTCTATGTAGATGGGGCAGCTAACAGGGAGACTAAATTAGGAAAAGCAGGATATGTTACTAATAGAGGAAGACAAAAAGTTGTCACCCTAACTGACACAACAAATCAGAAGACTGAGTTACAAGCAATTTATCTAGCTTTGCAGGATTCGGGATTAGAAGTAAACATAGTAACAGACTCACAATATGCATTAGGAATCATTCAAGCACAACCAGATCAAAGTGAATCAGAGTTAGTCAATCAAATAATAGAGCAGTTAATAAAAAAGGAAAAGGTCTATCTGGCATGGGTACCAGCACACAAAGGAATTGGAGGAAATGAACAAGTAGATAAATTAGTCAGTGCTGGAATCAGGAAAGTACTATTTTTAGATGGAATAGATAAGGCCCAAGATGAACATGAGAAATATCACAGTAATTGGAGAGCAATGGCTAGTGATTTTAACCTGCCACCTGTAGTAGCAAAAGAAATAGTAGCCAGCTGTGATAAATGTCAGCTAAAAGGAGAAGCCATGCATGGACAAGTAGACTGTAGTCCAGGAATATGGCAACTAGATTGTACACATTTAGAAGGAAAAGTTATCCTGGTAGCAGTTCATGTAGCCAGTGGATATATAGAAGCAGAAGTTATTCCAGCAGAAACAGGGCAGGAAACAGCATATTTTCTTTTAAAATTAGCAGGAAGATGGCCAGTAAAAACAATACATACTGACAATGGCAGCAATTTCACCGGTGCTACGGTTAGGGCCGCCTGTTGGTGGGCGGGAATCAAGCAGGAATTTGGAATTCCCTACAATCCCCAAAGTCAAGGAGTAGTAGAATCTATGAATAAAGAATTAAAGAAAATTATAGGACAGGTAAGAGATCAGGCTGAACATCTTAAGACAGCAGTACAAATGGCAGTATTCATCCACAATTTTAAAAGAAAAGGGGGGATTGGGGGGTACAGTGCAGGGGAAAGAATAGTAGACATAATAGCAACAGACATACAAACTAAAGAATTACAAAAACAAATTACAAAAATTCAAAATTTTCGGGTTTATTACAGGGACAGCAGAAATCCACTTTGGAAAGGACCAGCAAAGCTCCTCTGGAAAGGTGAAGGGGCAGTAGTAATACAAGATAATAGTGACATAAAAGTAGTGCCAAGAAGAAAAGCAAAGATCATTAGGGATTATGGAAAACAGATGGCAGGTGATGATTGTGTGGCAAGTAGACAGGATGAGGAT",
"05" : "rt",
"07" : "100"
};*/

    _options = {"00": ""+_in_GeneticCodeTable,
                "01": "0.7",
                "02": resultDB,
                "03": ""+refOption,
                "04": dagene,
                "06": scoreFileString,
                "07": ""+_in_minReadL};
    
                if ( refOption != 2 ) {
                    _options["05"] = dasequence;
                }
		
		GLOBAL_FPRINTF_REDIRECT = "/dev/null";
		//GLOBAL_FPRINTF_REDIRECT = "";
		ExecuteAFile ( "454_codon_aligner.bf", _options );
		GLOBAL_FPRINTF_REDIRECT = "";		
		
		/*modify gene_map to only those for which reads were found */
		DoSQL ( SQL_OPEN, resultDB, DBID );
		_dbRecordCounter = 0;
		DoSQL ( DBID, "SELECT * FROM AA_ALIGNMENT WHERE COVERAGE>0", "return _CountMatchingRecords(0)");
		totalCoverage = 0 + _dbRecordCounter;
		DoSQL ( SQL_CLOSE, "", DBID );
		
		if ( totalCoverage == 0 ) {
			_do_gene_map [_ak][0] = 0;
		}
		else {
			lastgene = _ak;
		}
		if ( refOption == 3 ) { /*all genes in list are processed for refOption == 3, whereas only those where totalcoverage != 0 are processed for refOption == 1*/
			lastgene = _ak;
		}
		
	}
}


/*PH1: Summary statistics of length, depth, and frequency of majority and minority variants*/

fprintf		(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 1:</b> Estimating summary statistics</DIV>" );
for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
	if ( _do_gene_map [ _ak ][0] ) {
		if ( refOption == 1 ) {
			dagene = (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
		}
		else {
			dagene = localRefSeqNames[_ak][0];
		}
		
		resultDB = baseFilePath + "_uds." + dagene + ".cache";
		csvpath  = baseFilePath + "_uds." + dagene + ".posreport.csv";
		_options = {};
		ExecuteCommands ( "_options[\"00\"] = \"" + resultDB + "\";" );
		ExecuteCommands ( "_options[\"01\"] = \"" + _in_def_min_coverage + "\";" );
		ExecuteCommands ( "_options[\"02\"] =\"" + csvpath + "\";" );
		GLOBAL_FPRINTF_REDIRECT = "/dev/null";
		ExecuteAFile ( "454_reporter.bf", _options );
		GLOBAL_FPRINTF_REDIRECT = "";
	}
}


/*PH2: Sliding window analysis of nucleotide diversity, tree drawing etc */

fprintf				(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 2:</b> Estimating nucleotide diversity in sliding windows</DIV>" );
for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
	if ( _do_gene_map [_ak][0] ) {
		if ( refOption == 1 ) {
			dagene = (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
		}
		else {
			dagene = localRefSeqNames[_ak][0];
		}
		resultDB = baseFilePath + "_uds." + dagene + ".cache";
		_options = {};
		ExecuteCommands ( "_options[\"00\"] = \"" + _in_GeneticCodeTable + "\";" );
		ExecuteCommands ( "_options[\"01\"] = \"" + resultDB + "\";" );
		ExecuteCommands ( "_options[\"02\"] = \"" + _in_def_window_span + "\";" );
		ExecuteCommands ( "_options[\"03\"] = \"" + _in_def_stride + "\";" );
		ExecuteCommands ( "_options[\"04\"] = \"" + _in_def_minCopyCount + "\";" );
		ExecuteCommands ( "_options[\"05\"] = \"" + _in_def_min_coverage + "\";" );
		ExecuteCommands ( "_options[\"06\"] = \"" + _in_def_nuc_diversity_threshold + "\";" );
		_options["07"] = "100";
		_options["08"] = "" + modelFileToName[_in_scoreMatrix];
		_options["09"] = "No";
		ExecuteAFile ( "454_sliding_window.wbf", _options );
		
		
	}
}




/*PH3: Estimating the number of mutation rate classes across sites */


fprintf				(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 3: </b>Estimating mutation rate classes</DIV>" );
for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
	if ( _do_gene_map [ _ak ][0] ) {
		if ( refOption == 1 ) {
			dagene = (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
		}
		else {
			dagene = localRefSeqNames[_ak][0];
		}
		resultDB = baseFilePath + "_uds." + dagene + ".cache";
		_options = {};
		ExecuteCommands ( "_options[\"00\"] = \"" + resultDB + "\";" );
		ExecuteCommands ( "_options[\"01\"] = \"" + _in_def_min_coverage + "\";" );
		ExecuteAFile ( "454_variants.bf", _options );
		
		_options = {};
		ExecuteCommands ( "_options[\"00\"] = \"" + resultDB + "\";" );
		ExecuteCommands ( "_options[\"01\"] = \"0\";" );
		ExecuteAFile ( "454_rateClass_NEB.bf", _options );
		
	}
}



/*PH4: Sitewise diversifying/purifying selection analysis */

fprintf				(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 4: </b>Estimating diversifying/purifying selection at sites</DIV>" );
for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
	if ( _do_gene_map [ _ak ][0] ) {
		if ( refOption == 1 ) {
			dagene = (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
		}
		else {
			dagene = localRefSeqNames[_ak][0];
		}
		resultDB = baseFilePath + "_uds." + dagene + ".cache";
		_options = {};
		ExecuteCommands ( "_options[\"00\"] = \"" + _in_GeneticCodeTable + "\";" );
		ExecuteCommands ( "_options[\"01\"] = \"" + resultDB + "\";" );
		ExecuteCommands ( "_options[\"02\"] = \"" + _in_def_min_coverage + "\";" );
		ExecuteAFile ( "454_FEL.bf", _options );
	}
}


/*PH5: Drug resistant mutation screening if rt, pr or pol */
if ( _in_dodr && refOption == 1 ) {
	fprintf				(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 5: </b>Identifying drug resistant variants</DIV>" );
	for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
		if ( _do_gene_map [_ak][0] && _do_gene_map[_ak][1] ) { /* ie: pr, rt, prrt, prrt, pol : see ../Shared/hiv_1_ref_sequences.ibf */
			dagene = (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
			resultDB = baseFilePath + "_uds." + dagene + ".cache";
			_options = {};
			ExecuteCommands ( "_options[\"00\"] = \"" + resultDB + "\";" );
			ExecuteCommands ( "_options[\"01\"] = \"" + _in_def_min_drugscore + "\";" );
			ExecuteCommands ( "_options[\"02\"] = \"" + _in_def_min_mdr_coverage + "\";" );
			ExecuteCommands ( "_options[\"03\"] = \"" + _ak + "\";" );
			ExecuteAFile ("454_MDR_variants.bf", _options );
			
			_options = {};
			ExecuteCommands ( "_options[\"00\"] = \"" + resultDB + "\";" );
			ExecuteCommands ( "_options[\"01\"] = \"1\";" );
			ExecuteAFile ( "454_rateClass_NEB.bf", _options );
		}
	}
}


/*PH6: Compensatory mutation analysis for (N)NRTI's */
if ( _in_dodr && refOption == 1 ) {
	fprintf				(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 6: </b>Identifying drug accessory mutations</DIV>" );
	for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
		if ( _do_gene_map [_ak][0] && _do_gene_map [_ak][1] ) { /*only rt, prrt, prrt, pol: see ../Shared/hiv_1_ref_sequences.ibf */
			dagene = (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
			resultDB = baseFilePath + "_uds." + dagene + ".cache";
			_options = {};
			ExecuteCommands ( "_options[\"00\"] = \"" + _in_GeneticCodeTable + "\";" );
			ExecuteCommands ( "_options[\"01\"] = \"" + _in_scoreMatrix + "\";" );
			ExecuteCommands ( "_options[\"02\"] = \"" + _ak + "\";" );
			ExecuteCommands ( "_options[\"03\"] = \"" + resultDB + "\";" );
			ExecuteAFile ( "454_compensatoryMutations.bf", _options );
		}
	}
}


/*create a legend table*/
for ( _ak = 0; _ak < Rows ( _do_gene_map ); _ak = _ak + 1 ) {
	if ( _do_gene_map [_ak][0] ) {
		if ( refOption == 1 ) {
			dagene = (localRefSeqNames[_ak][0]^{{"HXB2_"}{""}})^{{"NL4_3"}{""}};
		}
		else {
			dagene = localRefSeqNames[_ak][0];
		}
		resultDB = baseFilePath + "_uds." + dagene + ".cache";
		_options = {};
		ExecuteCommands ( "_options[\"00\"] = \"" + _in_GeneticCodeTable + "\";" );
		ExecuteCommands ( "_options[\"03\"] = \"" + resultDB + "\";" );
		ExecuteAFile ( "454_annotate.bf", _options );
	}
}

if ( refOption == 1 ) {
	newlocalRefSeqs = { Abs ( localRefSeqs ), 1 };
	for ( _ak = 0; _ak < Abs ( localRefSeqs ); _ak = _ak + 1 ) {
		ExecuteCommands ( "newlocalRefSeqs [ _ak ] = localRefSeqs[\"" + _ak + "\"];" );
	}
	localRefSeqs = newlocalRefSeqs;
}


fprintf ( finalPHP, _do_gene_map, "\n", _in_scoreMatrix, "\n", total454Sequences, "\n", _in_GeneticCodeTable, "\n",refOption,"\n",localRefSeqNames,"\n",localRefSeqs,"\n",_in_dodr );

fprintf (intermediateHTML,CLEAR_FILE,"DONE");
GetString (HTML_OUT, TIME_STAMP, 1);
fprintf ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",raw454Sequences.species,",",raw454Sequences.sites,",",Time(1)-uds_timer,",",_in_GeneticCodeTable,",",_in_scoreMatrix,",",_in_minReadL,"\n");




