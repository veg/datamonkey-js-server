ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/GrabBag.bf");
ExecuteAFile	("../Shared/DBTools.ibf");
ExecuteAFile    ("../Shared/hiv_1_ref_sequences.ibf");
ExecuteAFile    ("../Formats/alignmentScoreMatrices/matrixlist.ibf");

fscanf ( stdin, "String", _in_FilePath );
fscanf ( stdin, "Number", _phred );
fscanf ( stdin, "Number", _minread );
fscanf ( stdin, "Number", GencodeID ); 
fscanf ( stdin, "Number", _in_gotQual );

/*print out qc results*/

filePathInfo = splitFilePath (_in_FilePath);
jobID = filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"];

statsFile 		= _in_FilePath + ".fna.qc.stats";
fnaQCFile 		= _in_FilePath + ".fna.qc.fna";
udsConfigFile 	= _in_FilePath + ".uds.config";

DataSet 			ds 	=  ReadDataFile (fnaQCFile);
DataSetFilter		filteredData = CreateFilter (ds,1);
 
if ( _in_gotQual ) { /*report the qc results either from previous run or from first run */

	fscanf ( statsFile, "Number,Number,Number", originalReads, contributingReads, retainedFragments );
	fscanf ( statsFile, "Number,Number,Number,Number,Number,Number,Number,Number", mean_o, median_o, var_o, sd_o, min_o, lowerprcntl_o, upperprcntl_o, max_o );
	fscanf ( statsFile, "Number,Number,Number,Number,Number,Number,Number,Number", mean_r, median_r, var_r, sd_r, min_r, lowerprcntl_r, upperprcntl_r, max_r );

	jobFileName = BASE_CGI_URL_STRING + "showdata.pl?" + jobID;
	fprintf ( stdout, "<H1 CLASS='SuccessCap'>454 Quality Filtering results</H1>" );
	fprintf ( stdout, "<DIV CLASS='RepClassCT'><b>Reports</b> <a href='",jobFileName,".fna' target='_BLANK'>[UPLOADED READS]</a><a href='",jobFileName,".qual' target='_BLANK'>[UPLOADED PHRED]</a><a href='",jobFileName,".fna.qc.fna' target='_BLANK'>[QC'd READS]</a></DIV>");

	fprintf ( stdout, "<DIV class = 'RepClassSM'>Quality filtering with a phred score of ", _phred, " and minimum read length of ", _minread, " reduced the total number of reads from ", originalReads, " to ", contributingReads, ". A total of ", retainedFragments, " high-scoring fragments were retained for subsequent analyses. Summary statistics of original and contributing reads are provided below.<br\><br\>" );
	fprintf ( stdout, "<TABLE BORDER = '0' align='center'><TR CLASS = 'TRReport' style = 'font-size:small'><th>Summary statistics</th><th>Original reads</th><th>QC Filtered reads</th></TR>" );
	fprintf ( stdout, "<TR CLASS='TRReport1' style = 'font-size:x-small'><td>Mean</td><td>",mean_o,"</td><td>",mean_r,"</td></TR>");
	fprintf ( stdout, "<TR CLASS='TRReport2' style = 'font-size:x-small'><td>Median</td><td>",median_o,"</td><td>",median_r,"</td></TR>");
	fprintf ( stdout, "<TR CLASS='TRReport1' style = 'font-size:x-small'><td>Variance</td><td>",var_o,"</td><td>",var_r,"</td></TR>");
	fprintf ( stdout, "<TR CLASS='TRReport2' style = 'font-size:x-small'><td>Standard Deviation</td><td>",sd_o,"</td><td>",sd_r,"</td></TR>");
	fprintf ( stdout, "<TR CLASS='TRReport1' style = 'font-size:x-small'><td>Min</td><td>",min_o,"</td><td>",min_r,"</td></TR>");
	fprintf ( stdout, "<TR CLASS='TRReport2' style = 'font-size:x-small'><td>2.5%</td><td>",lowerprcntl_o,"</td><td>",lowerprcntl_r,"</td></TR>");
	fprintf ( stdout, "<TR CLASS='TRReport1' style = 'font-size:x-small'><td>97.5%</td><td>",upperprcntl_o,"</td><td>",upperprcntl_r,"</td></TR>");
	fprintf ( stdout, "<TR CLASS='TRReport2' style = 'font-size:x-small'><td>Max</td><td>",max_o,"</td><td>",max_r,"</td></TR>");
	fprintf ( stdout, "</TABLE></DIV>" );

	slacDBID = _openCacheDB      (jobID);
	fileInformation 					= {};
	fileInformation ["read_type"]		= "TEXT";
	fileInformation ["mean"] 		 	= "REAL";
	fileInformation ["median"] 	 		= "REAL";
	fileInformation ["variance"] 	 	= "REAL";
	fileInformation ["sd"] 				= "REAL";
	fileInformation ["min"] 	 		= "REAL";
	fileInformation ["lowerprcntl"] 	= "REAL";
	fileInformation ["upperprcntl"] 	= "REAL";
	fileInformation ["max"] 	 		= "REAL";
	
	_CheckDBID (slacDBID,"UDS_QC_STATS",fileInformation);

	record = {};
	record["read_type"] 	= "original";
	record["mean"] 			= mean_o;
	record["median"] 		= median_o;
	record["variance"] 		= var_o;
	record["sd"] 			= sd_o;
	record["min"] 			= min_o;
	record["lowerprcntl"] 	= lowerprcntl_o;
	record["upperprcntl"] 	= upperprcntl_o;
	record["max"] 			= max_o;
	_InsertRecord (slacDBID,"UDS_QC_STATS", record);

	record = {};
	record["read_type"] 	= "retained";
	record["mean"] 			= mean_r;
	record["median"] 		= median_r;
	record["variance"] 		= var_r;
	record["sd"] 			= sd_r;
	record["min"] 			= min_r;
	record["lowerprcntl"] 	= lowerprcntl_r;
	record["upperprcntl"] 	= upperprcntl_r;
	record["max"] 			= max_r;
	_InsertRecord (slacDBID,"UDS_QC_STATS", record);
	
	_closeCacheDB (slacDBID);
}

geneIdxArray = { Rows ( RefSeqNames ), 1 };

while (1) 
{
	fscanf ( stdin, "Number", geneIdx );
	if ( geneIdx < 0 ) {
		if ( geneIdx == (-2) ) { /*process reference sequences from file*/
			doCustom = 1;
		}
		if ( geneIdx == (-3) ) { /*longest read is reference*/
			doLong = 1;
		}		
		break;
	}
	geneIdxArray [ geneIdx ] = 1;	
}

if ( doCustom || doLong ) { /*don't use hxb2 reference sequences, rather use longest read (-3) or custom ref sequences provided in file (-2)*/
	if ( doLong ) {
		fprintf ( udsConfigFile, CLEAR_FILE, "{{-3}};\n" ); 
	}
	else { /*print the reference sequences to config file*/
		udsRefFile = _in_FilePath + ".uds.customref.config";
		fscanf ( udsRefFile, "Matrix,Matrix", refNames, refSequences );
		fprintf ( udsConfigFile, CLEAR_FILE, "{\n" );
		for ( _k = 0; _k < Rows ( refNames ); _k = _k + 1 ) {
			fprintf ( udsConfigFile, "{\"", refNames [_k], "\", \"", refSequences [_k], "\"}\n" ); 
		}
		fprintf ( udsConfigFile, "};\n" ); 
	}
}
else {
	fprintf ( udsConfigFile, CLEAR_FILE, geneIdxArray, ";\n" );
}

fscanf ( "../Formats/uds_optionscheck", "Raw", rehash );
fprintf ( stdout, rehash );

DR_TRUE = 0;
if ( doLong || doCustom ) {
	if ( doLong ) {
		fprintf ( stdout, "<DIV class = 'RepClassSM'>The UDS analysis pipeline will now proceed with filtering of genes from the 454 sample using the longest 454 read as the reference sequence</DIV>" );
	}
	else {
		fprintf ( stdout, "<DIV class = 'RepClassSM'>The UDS analysis pipeline will now proceed with filtering of genes from the 454 sample using the following custom reference sequences provided. Note only the first 50 nucleotides are printed for each.<br/><br/>" );
		customRefFile 	= _in_FilePath + ".uds.customref.config";
		
		fscanf ( customRefFile, "Matrix", customRefNames );
		fscanf ( customRefFile, "Matrix", customRefSeqs );
		fprintf ( stdout, "<TABLE BORDER = '0' align='center'>" );
		for ( _test = 0; _test < Rows ( customRefNames ); _test = _test + 1 ) {
			fprintf ( stdout, "<TR CLASS='TRReport",(_test%2)+1,"' style = 'font-size:x-small'><TD>", customRefNames [ _test ], "</TD><TD>", (customRefSeqs[_test])[0][49],"...</TD></TR>" );
		}
		fprintf ( stdout, "</TABLE></DIV>" );
	}
}
else {
	fprintf ( stdout, "<DIV class = 'RepClassSM'>The UDS analysis pipeline will now proceed with filtering of genes from the 454 sample using the reference sequences you selected. The followings genes will be filtered and used for subsequent analysis:<br/><br/>" );
	fprintf ( stdout, "<TABLE BORDER = '0' align='center'>" );
	ct = 0;
	for ( _test = 0; _test < Rows ( RefSeqNames ); _test = _test + 1 ) {
		if ( geneIdxArray [ _test ] == 1 ) {
			fprintf ( stdout, "<TR CLASS='TRReport",(ct%2)+1,"' style = 'font-size:x-small'><td>HIV-1 ", RefSeqNames [ _test ][0], "</td><td>",RefSeqNames [ _test ][1] ,"</td></TR>" );
			ct = ct + 1;
			if ( ( _test == 6 || _test == 7 || _test > 10 ) && !DR_TRUE ) {
				DR_TRUE = 1;	
			}
		}
	}
	fprintf ( stdout, "</TABLE></DIV>" );
}

fprintf ( stdout, "<div class = 'RepClassSM'><b>Phase 1 Options:</b> <a href='",BASEL_URL_STRING,"help/uds.php' target = '_blank' class = 'INFO'>Help</a><br/><br/>",	 
				  "<FORM name='udsOptions' method='POST' enctype='multipart/form-data' action='",BASE_CGI_URL_STRING,"dispatchAnalysis.pl'>",
				  "<TABLE BORDER = '0' align = 'center'>",
				  "<TR><TD><span id = 'minReadLengthText'>Minimum read length to be included in subsequent analyses: </span></TD><TD>",
				  "<INPUT TYPE = 'Text' NAME = 'minread' VALUE = '100' MAXLENGTH = '15' SIZE = '10' onChange='flagOddValues()'></TR></TD>" );


TOOLTIPS_STRING = "";
TOOLTIPS_STRING * 256;
TOOLTIPS_STRING * ( "<SCRIPT LANGUAGE = 'JavaScript' type='text/javascript'>var tooltip_strings = new Array();" );
MATRIX_STRING = "";
MATRIX_STRING * 128;

for ( _k = 0; _k < Abs ( modelList ); _k = _k + 1 ) {
	MATRIX_STRING *  ( "<OPTION VALUE='" + (modelList[_k])["File"] + "'>" + (modelList[_k])["Name"] + "\n");
	TOOLTIPS_STRING * ("tooltip_strings[" + _k + "] = '" + (modelList[_k])["Description"] + "';");
}
TOOLTIPS_STRING * ( "</SCRIPT>" );
TOOLTIPS_STRING * 0;
MATRIX_STRING * 0;

fprintf ( stdout, TOOLTIPS_STRING );
fprintf ( stdout, "<TR><TD>Choose an alignment score matrix:</TD><TD>");
fprintf ( stdout, "<SELECT id ='scoreMatrix' name='scoreM' onmouseover = \"Tip(tooltip_strings[document.udsOptions.scoreMatrix.selectedIndex])\">" );
fprintf ( stdout, MATRIX_STRING );
fprintf ( stdout, "</SELECT></TD></TR></TABLE></DIV>" );

fprintf ( stdout, "<div class = 'RepClassSM'><b>Phase 3 Options:</b> <a href='",BASEL_URL_STRING,"help/uds.php' target = '_blank' class = 'INFO'>Help</a><br/><br/>",
					"<TABLE BORDER = '0' align = 'center'>",
				  	"<tr><td><span id = 'minCoverageText'>Minimum coverage: </span></td><td>",
					"<INPUT TYPE = 'Text' NAME = 'mincoverage' VALUE = '250' MAXLENGTH = '15' SIZE = '10'></td></tr>",
				 	"<tr><td><span id = 'windowSizeText'>Window size for sliding window estimation of nucleotide diversity: </span></td><td>",
				 	"<INPUT TYPE = 'Text' NAME = 'windowsize' VALUE = '150' MAXLENGTH = '15' SIZE = '10'></td></tr>",
				 	"<tr><td><span id = 'windowStrideText'>Length of sliding window stride: </span></td><td>",
				 	"<INPUT TYPE = 'Text' NAME = 'windowstride' VALUE = '20' MAXLENGTH = '15' SIZE = '10'></td></tr>",	
				 	"<tr><td><span id = 'mincopyCountText'>Minimum number of copies for a read to be considered a variant: </span></td><td>",
				 	"<INPUT TYPE = 'Text' NAME = 'mincopycount' VALUE = '10' MAXLENGTH = '15' SIZE = '10'></td></tr>",	
				 	"<tr><td><span id = 'divThresholdText'>Threshold of nucleotide diversity for the assignment of multiple infection: </span></td><td>",
				 	"<INPUT TYPE = 'Text' NAME = 'nucdivthreshold' VALUE = '0.05' MAXLENGTH = '15' SIZE = '10'></td></tr>",
				 	"</TABLE></DIV>");
				 	
if ( DR_TRUE ) {
	fprintf 	( stdout, 	"<div class = 'RepClassSM'><b>Phase 6/7 Options:</b> <a href='",BASEL_URL_STRING,"help/uds.php' target = '_blank' class = 'INFO'>Help</a><br/><br/>",
							"<TABLE BORDER = '0' align = 'center'>",
							"<tr><td><span id = 'minDrugScoreText'>Minimum Stanford score to consider a drug resistant mutation: </span></td><td>",
							"<INPUT TYPE = 'Text' NAME = 'mindrugscore' VALUE = '35' MAXLENGTH = '15' SIZE = '10'></td></tr>",
							"<tr><td><span id = 'minDrugScoreText'>Minimum coverage to consider a drug resistant site: </span></td><td>",
							"<INPUT TYPE = 'Text' NAME = 'mindrugcoverage' VALUE = '50' MAXLENGTH = '15' SIZE = '10'></td></tr>",
							"</TABLE></DIV>" );
}
else {
	fprintf ( stdout, 	"<input name='mindrugscore' type='hidden' value='0'>",
					  	"<input name='mindrugcoverage' type='hidden' value='0'>" );
}
				  
fprintf ( stdout, "<input name='min' type='hidden' value='", min_r, "'>",
				 "<input name='max' type='hidden' value='", max_r, "'>",
				 "<input name='filename' type='hidden' value='", jobID, "'>",
				 "<input name='genCodeID' type='hidden' value='", GencodeID, "'>",
				 "<input name='sequences' type='hidden' value='",filteredData.species,"'>",
				 "<input name='sites' type='hidden' value='",filteredData.sites,"'>",
				 "<input name='partitions' type='hidden' value='1'>",
				 "<input name='method' type='hidden' value='99'>",
				 "<input name='dodr' type='hidden' value='", DR_TRUE, "'>",
				 "<input name='lovemelongtime' type='hidden' value='", doLong, "'>",
				 "<input name='lovemelikeyouwantto' type='hidden' value='",doCustom,"'>",
				 "<div class = 'RepClassSM'>Click to <INPUT TYPE='Submit' VALUE='Run'> the analysis.",
				"</FORM></div>" );
				


