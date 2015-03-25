
ExecuteAFile			("../Shared/HyPhyGlobals.ibf" );
ExecuteAFile 			("../Shared/GrabBag.bf");
ExecuteAFile 			("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile			("../Shared/hiv_1_ref_sequences.ibf" );
ExecuteAFile 			("../Shared/DBTools.ibf" );
ExecuteAFile 			("../Shared/ReadScores.bf" );
ExecuteAFile			("../Formats/StanfordDrugLinks.ibf" );

skipCodeSelectionStep = 1;
ExecuteAFile			("../Shared/chooseGeneticCode.def" );
ApplyGeneticCodeTable(0);

f1 = 2;
f2 = 3;

binomialCoefficients = {};

fscanf ( stdin, "String", _in_filePrefix );
fscanf ( stdin, "Number", _in_reportType ); /* 0 = sliding window analysis; 1 = mutation rates per site; 2 = drug resistance summary, 3 drug resistance site reporter */
fscanf ( stdin, "String", _in_gene );
fscanf ( stdin, "Number", _option_output ); /*0 = html, 1 = csv report on sites */
fscanf ( stdin, "Number", _in_site );
fscanf ( stdin, "Number", _in_dodr );
fscanf ( stdin, "String", _in_drug_class );

spoolPATH 		= BASE_OUTPUT_PATH + _in_filePrefix;
dbFile 			= spoolPATH + "_uds." + _in_gene + ".cache";

DoSQL ( SQL_OPEN, dbFile, DBID );

if ( _in_reportType == 0 ) {

	printNucAlignWarning = 0;
	fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS='SuccessCap'>Sliding window diversity results: ", _in_gene, "</H1>\n");
	_recordsFound = {};
	DoSQL ( DBID, "SELECT * FROM DIVERSITY_SWS", "return _matchRecordsByField (0);" );
	slidingWindows = _recordsFound;

	_recordsFound = {};	
	DoSQL ( DBID, "SELECT * FROM DIVERSITY_SW", "return _matchRecordsByField (0);" );
	swSummary = _recordsFound;

	fprintf ( stdout, "<DIV class='RepClassSM'>The following sliding windows had sufficient coverage for estimation of diversity. A bootstrapped Neighbor-Joining tree (n=100) is estimated for the window with maximum diversity, whereas alignments and newick tree files (without bootstraps) are available for download for the remaining windows.<br/><br/>" );
	fprintf ( stdout, "<TABLE BORDER='0' align='center'><TR CLASS = 'TRReport' style = 'font-size:small'><TH>start</TH><TH>end</TH><TH>coverage</TH><TH># variants</TH><TH>maximum divergence</TH><TH>alignment/tree</TH></TR>" );
	for ( _k = 0; _k < Abs ( slidingWindows ); _k = _k + 1 ) {
		checkNucAlign = 0 + (slidingWindows[_k])["NUC_ALIGN"];
		if ( checkNucAlign ) {
			printNucAlignWarning = 1;
			windowpref = "*";
		}
		else {
			windowpref = "";
		}
	
		fprintf ( stdout, "<TR CLASS='TRReport",(_k%2)+1,"' style = 'font-size:x-small'><TD>", windowpref, (slidingWindows[_k])["START"],"</TD><TD>",(slidingWindows[_k])["END"],"</TD><TD>",(slidingWindows[_k])["COVERAGE"],"</TD><TD>",(slidingWindows[_k])["VARIANTS"],"</TD><TD>",(slidingWindows[_k])["DIV_ML"],"</TD><TD><a href='", BASE_HTML_URL_STRING, _in_filePrefix, "_uds.", _in_gene, "_", (slidingWindows[_k])["START"], "_", (slidingWindows[_k])["END"], ".fas'>[ALIGNMENT]</a><a href='", BASE_HTML_URL_STRING, _in_filePrefix, "_uds.", _in_gene, "_", (slidingWindows[_k])["START"], "_", (slidingWindows[_k])["END"], ".fas.tree'>[NEWICK_TREE]</a></TD></TR>" );
	}
	fprintf ( stdout, "</TABLE>" );
	
	if ( printNucAlignWarning ) {
		fprintf ( stdout, "<DIV CLASS = 'ErrorTagSM'><b>WARNING</b>:(*)Sequences for these sliding windows were nucleotide aligned and may be out of frame. Codon alignment was not done since none of the reads could be used as a reference sequence due to frameshift mutations.</DIV>" );
	}
	fprintf ( stdout, "</DIV>" );

	maxdivblob = "" + (swSummary[0])["MAX_DIVERGENCE_WINDOW"];
	maxdiv = splitOnRegExp( maxdivblob, "-" );
	
	_recordsFound = {};	
	DoSQL ( DBID, "SELECT VARIANTS FROM DIVERSITY_SWS WHERE (START='" + maxdiv[0] + "' AND END='" + maxdiv[1] + "');", "return _matchRecordsByField (1);" );
	variantsInWindow = 0 + _recordsFound[0];

	/*
	_recordsFound = {};	
	DoSQL ( DBID, "SELECT * FROM DIVERSITY_SWS;", "return _matchRecordsByField (0);" );	
	fprintf ( stdout, "<DIV class='RepClassSM'>Testing variants<br/>" );
	fprintf ( stdout, _recordsFound, "<br/>" );
	for ( k = 0; k < Abs ( _recordsFound ); k = k + 1 ) {
		fprintf ( stdout, k, ": ", (_recordsFound[k])["VARIANTS"], "<br/>" );
	}
	fprintf ( stdout, "</div>" );
	*/
	
	
	
	if ( variantsInWindow > 3 ) {
		fprintf ( stdout, "<DIV class='RepClassSM'><b>Window of maximum nucleotide diversity: ", maxdivblob, "</b><br/><br/>Neighbor-joining bootstrap tree of the sliding window with > 3 variants and maximum divergence. Nodes with bootstrap support > 90% are labeled. Since UDS reads are typically short there is very little signal in the data and thus most nodes will have no bootstrap support.<br/><br/>" );
		fprintf ( stdout, "Save <a href='", BASE_HTML_URL_STRING, _in_filePrefix, "_uds.", _in_gene, "_", maxdiv[0], "_", maxdiv[1], ".fas'>[ALIGNMENT]</a>" );
		fprintf ( stdout, "<a href='", BASE_HTML_URL_STRING, _in_filePrefix, "_uds.", _in_gene, "_", maxdiv[0], "_", maxdiv[1], ".fas.ps'>[PS_TREE]</a>" );
		fprintf ( stdout, "<a href='", BASE_HTML_URL_STRING, _in_filePrefix, "_uds.", _in_gene, "_", maxdiv[0], "_", maxdiv[1], ".fas.tree'>[NEWICK_TREE]</a>" );
		fprintf ( stdout, "<p><img src='", BASE_CGI_URL_STRING, "/renderpsimage.pl?file=", _in_filePrefix, "_uds.", _in_gene, "max_", maxdiv[0], "_", maxdiv[1], ".fas' frameborder='1' border='1px'></p>" );
		fprintf ( stdout, "</DIV>" );
	}
	else {
		fprintf ( stdout, "<DIV class='RepClassSM'>Insufficient variants (", variantsInWindow ,") in window of maximum nucleotide diversity (", maxdiv[0], "-", maxdiv[1], ") for bootstrap resampling.</DIV>" );
	}
	
}
if ( _in_reportType == 1 ) {

	if ( !_option_output ) {
		fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS='SuccessCap'>Sitewise mutation rate results: ", _in_gene, "</H1>\n");
	}
	_recordsFound = {};
	DoSQL ( DBID, "SELECT * FROM SITE_MU_RATES", "return _matchRecordsByField (0);" );
	site_mu_rates = _recordsFound;
	
	_recordsFound = {};
	DoSQL ( DBID, "SELECT * FROM DNDS", "return _matchRecordsByField (0);" );
	site_dnds = _recordsFound;
	
	for ( _k = 0; _k < Abs ( site_dnds ); _k = _k + 1 ) {
		_recordsFound = {};
		DoSQL ( DBID, "SELECT CONSENSUS_AA FROM AA_ALIGNMENT WHERE POSITION=\"" + (site_mu_rates[_k])["SITE"] + "\"", "return _matchRecordsByField (0);" );
		cons_aa = "" + _recordsFound[0];
		if ( _option_output ) { /*csv*/
			if ( _k == 0 ) {
				fprintf ( stdout, "site,consensus_aa,coverage,entropy,mutation_rate,mutation_rate_rank_percent,s_sites,ns_sites,s_subs,ns_subs,p_div,p_pur\n" );
			}
			fprintf ( stdout, (site_mu_rates[_k])["SITE"], ",", cons_aa, ",", (site_mu_rates[_k])["COVERAGE"], ",", (site_mu_rates[_k])["ENTROPY"], ",", (site_mu_rates[_k])["MU"], ",", (site_mu_rates[_k])["MU_RNK_PRCNT"], ",",
			                  (site_dnds[_k])["S_SITES"], ",", (site_dnds[_k])["NS_SITES"], ",", (site_dnds[_k])["S_SUBS"], ",", (site_dnds[_k])["NS_SUBS"], ",", (site_dnds[_k])["PP_REAL"], ",", (site_dnds[_k])["PN_REAL"], "\n" );
		}
		else {
			if ( _k == 0 ) {
				fprintf ( stdout, "<DIV class='RepClassSM'>" );
				fprintf ( stdout, "<TABLE BORDER='0' align='center'><TR CLASS='TRReport' style='font-size:small'><TH>bg</TH><TH>site</TH><TH>cons</TH><TH>cvg</TH><TH>entropy</TH><TH>mu rate</TH><TH>mu rank</TH><TH>syn sites</TH><TH>non-syn sites</TH><TH>syn subs</TH><TH>non-syn subs</TH><TH>P(div)</TH><TH>P(pur)</TH><TH>profile</TR>" );
			}
			_recordsFound = {};
			DoSQL ( DBID, "SELECT min(mu_rate) FROM MU_RATE_CLASSES WHERE AIC=(SELECT min(AIC) FROM MU_RATE_CLASSES);", "return _matchRecordsByField (0);" );
			_minRate = _recordsFound;
			
			hxb2Site = 0 + (site_mu_rates[_k])["SITE"];
			
			_recordsFound = {};
			DoSQL ( DBID, "SELECT POSTERIOR FROM SITE_POSTERIORS WHERE (SITE ='" + hxb2Site + "' AND RATE_CLASS='0');", "return _matchRecordsByField (1);" );	
			posterior = 0 + _recordsFound[0];
			bgstring = "";
			if ( posterior > 0.05 ) {
				bgstring = "";
			}
			else {
				bgstring = "*";
			}
			
			fprintf ( stdout, "<TR CLASS='TRReport",(_k%2)+1,"' style = 'font-size:x-small'><TD>", bgstring, "</TD><TD>", (site_mu_rates[_k])["SITE"], "</TD><TD>", cons_aa,"</TD><TD>", (site_mu_rates[_k])["COVERAGE"], "</TD><TD>", Format ( (site_mu_rates[_k])["ENTROPY"], f1, f2 ), "</TD><TD>", Format ( (site_mu_rates[_k])["MU"], f1, f2), "</TD><TD>", (site_mu_rates[_k])["MU_RNK_PRCNT"], "</TD>" );
			fprintf ( stdout, "<TD>", Format ( (site_dnds[_k])["S_SITES"], f1, f2 ), "</TD><TD>", Format ( (site_dnds[_k])["NS_SITES"], f1, f2 ), "</TD><TD>", Format ( (site_dnds[_k])["S_SUBS"], f1, f2 ), "</TD><TD>", Format ( (site_dnds[_k])["NS_SUBS"], f1, f2 ), "</TD><TD>", Format ( (site_dnds[_k])["PP_REAL"], f1, f2 ), "</TD><TD>", Format ( (site_dnds[_k])["PN_REAL"], f1, f2 ), "</TD>" );
			fprintf ( stdout, "<TD><a href='",BASE_CGI_URL_STRING,"udsReport.pl?file=",_in_filePrefix,"&report_type=3&gene=",_in_gene,"&site=",(site_mu_rates[_k])["SITE"],"'>[profile]</a></TR>" );
		}
	}
	if ( !_option_output ) {
		fprintf ( stdout, "</TABLE><br/><br/>" );
		fscanf ( "../Formats/uds_report_sitewisetable", "Raw", _legend );
		fprintf ( stdout, _legend, "</DIV>" );
	}
}

if ( _in_reportType == 2 ) {	
	if ( !_option_output ) {
		fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS='SuccessCap'>", _in_drug_class, " Sitewise drug resistance results: ", _in_gene, "</H1>\n");
	}
	
	_recordsFound = {};
	DoSQL ( DBID, "SELECT * FROM MDR_VARIANTS WHERE DRUG_CLASS='" + _in_drug_class + "' ORDER BY MDR_SITE", "return _matchRecordsByField (0);" );
	mdr_var = _recordsFound;
		
	if ( Abs ( mdr_var ) ) {
		if ( !_option_output ) {
			fprintf (stdout, "<DIV CLASS='RepClassCT'><b>Reports</b> <a href='",BASE_CGI_URL_STRING,"udsReport.pl?file=",_in_filePrefix,"&report_type=2&gene=",_in_gene,"&outmode=1&dc=",_in_drug_class,"' target = '_blank'>[CSV]</a></DIV>");
			fprintf ( stdout, "<DIV class='RepClassSM'>The following sites resistant to ", _in_drug_class, "'s were detected in ", _in_gene, "<br/><br/>" );
		}
		for ( _k = 0; _k < Abs ( mdr_var ); _k = _k + 1 ) {
			if ( _k == 0 ) {
				if ( !_option_output ) {
					fprintf ( stdout, "<TABLE BORDER='0' align='center'><TR CLASS='TRReport' style='font-size:small'><TH>site</TH><TH>cov</TH><TH>wt</TH><TH>wt %</TH><TH>dr</TH><TH>dr %</TH><TH>CI %</TH><TH>oth</TH><TH>oth %</TH><TH>entropy</TH><TH>mu</TH><TH>mu rank %</TH><TH>profile</TH></TR>" );
				}
				else {
					
					fprintf ( stdout, "site,coverage,wildtype,wildtype_percent,drug_resistant,drug_resistant_percent,CI_drug_resistant,other,other_percent,entropy,mu_rate,_mu_rate_rank_percent\n" );
				}
			}
			if ( !_option_output ) {
				fprintf ( stdout, "<TR CLASS='TRReport",(_k%2)+1,"' style = 'font-size:x-small'><TD>", (mdr_var[_k])["SITE_GENE_START"], "</TD><TD>", (mdr_var[_k])["COVERAGE"], "</TD><TD>", (mdr_var[_k])["WILDTYPE"], "</TD><TD>", (mdr_var[_k])["WILDTYPE_PRCNT"], "</TD><TD>", (mdr_var[_k])["RESISTANCE"], "</TD><TD>", (mdr_var[_k])["RESISTANCE_PRCNT"], "</TD><TD>", (mdr_var[_k])["CI"], "</TD><TD>", (mdr_var[_k])["OTHER"], "</TD><TD>", (mdr_var[_k])["OTHER_PRCNT"], "</TD><TD>", Format ( (mdr_var[_k])["ENTROPY"], 2, 4), "</TD><TD>", Format ((mdr_var[_k])["MU"], 2, 4), "</TD><TD>", (mdr_var[_k])["MU_RNK_PRCTL"], "</TD><TD><a href='",BASE_CGI_URL_STRING,"udsReport.pl?file=",_in_filePrefix,"&report_type=3&gene=",_in_gene,"&site=",(mdr_var[_k])["SITE_GENE_START"],"&dodr=1'>[profile]</a></TD></TR>" );
			}
			else {
				fprintf ( stdout, (mdr_var[_k])["SITE_GENE_START"], ",", (mdr_var[_k])["COVERAGE"], ",", (mdr_var[_k])["WILDTYPE"], ",", (mdr_var[_k])["WILDTYPE_PRCNT"], ",", (mdr_var[_k])["RESISTANCE"], ",", (mdr_var[_k])["RESISTANCE_PRCNT"], ",", (mdr_var[_k])["CI"], ",", (mdr_var[_k])["OTHER"], ",", (mdr_var[_k])["OTHER_PRCNT"], ",", Format ( (mdr_var[_k])["ENTROPY"], 2, 4), ",", Format ((mdr_var[_k])["MU"], 2, 4), ",", (mdr_var[_k])["MU_RNK_PRCTL"], "\n" );
			}
		}
		if ( !_option_output ) {
			fprintf ( stdout, "</TABLE></DIV>" );
		}
		
		if ( !_option_output ) {
			fprintf ( stdout, "<DIV class='RepClassSM'>" );
			fscanf ( "../Formats/uds_report_drugsitewisetable", "Raw", _legend );
			fprintf ( stdout, _legend, "</DIV>" );
		}	
		
		PTABLE = "SITE_DR_POSTERIORS";
		_recordsFound = {};
		DoSQL ( DBID, "SELECT max(RATE_CLASS) FROM " + PTABLE + "", "return _matchRecordsByField (0);" );
		numRates = (0 + _recordsFound[0]) + 1;
	
		if ( ( !_option_output ) && ( numRates != 2 ) ) {
			
			fprintf ( stdout, "<DIV class='RepClassSM'>Mutation rate class assignment for drug resistant sites. In each case an empirical Bayesian approach is used to assign a site to one of <b>", numRates, "</b> mutation rate classes estimated from the complete alignment.<br/><br/>" );
			
			for ( _k = 0; _k < Abs ( mdr_var ); _k = _k + 1 ) {
				zeSite = 0 + (mdr_var[_k])["MDR_SITE"];
	
				_recordsFound = {};
				DoSQL ( DBID, "SELECT * FROM " + PTABLE + " WHERE MDR_SITE='" + zeSite + "';", "return _matchRecordsByField (1);" );	
				_siteData = _recordsFound;
		
				_recordsFound = {};
				DoSQL ( DBID, "SELECT POSTERIOR,RATE_CLASS FROM " + PTABLE + " WHERE (MDR_SITE='" + zeSite + "' AND POSTERIOR=(SELECT max(POSTERIOR) FROM " + PTABLE + " WHERE MDR_SITE='" + zeSite + "'));", "return _matchRecordsByField (1);" );	
				rc = 0 + (_recordsFound[0])["RATE_CLASS"];
				posterior = 0 + (_recordsFound[0])["POSTERIOR"];
				rowString = "";
				if ( ( rc == 0 ) || posterior < 0.95 ) {
					rowString = "NT";
				}
				else {
					rowString = "PS";
				}
			
				if ( _k == 0 ) {
					fprintf ( stdout, "<TABLE BORDER='0' align='center'><TR CLASS='TRReport' style='font-size:small'><TH></TH><TH>site</TH><TH>cvg</TH>" );
					for ( _l = 0; _l < numRates; _l = _l + 1 ) {
						fprintf ( stdout, "<TH>posterior_",_l,"</TH>" );
					}
					fprintf ( stdout, "</TR>" );
					fprintf ( stdout, "<TR CLASS='TRReportNT'><TH bgcolor='#CCCCCC'><b>rate:</b></TH><TH bgcolor='#CCCCCC'></TH><TH bgcolor='#CCCCCC'></TH>" );
					for ( _l = 0; _l < numRates; _l = _l + 1 ) {
						fprintf ( stdout, "<TH bgcolor='#CCCCCC'>", (_siteData[_l])["RATE"], "</TH>" );
					}
					fprintf ( stdout, "</TR>" );
					fprintf ( stdout, "<TR CLASS='TRReportNT'><TH bgcolor='#CCCCCC'><b>weight:</b></TH><TH bgcolor='#CCCCCC'></TH><TH bgcolor='#CCCCCC'></TH>" );
					for ( _l = 0; _l < numRates; _l = _l + 1 ) {
						fprintf ( stdout, "<TH bgcolor='#CCCCCC'>", (_siteData[_l])["WEIGHT"], "</TH>" );
					}
					fprintf ( stdout, "</TR><TR><TD></TD></TR>" );
				}
				fprintf ( stdout, "<TR CLASS='TRReport",rowString,"' style = 'font-size:x-small'><TD bgcolor='#CCCCCC'></TD><TD>", (_siteData[0])["SITE_GENE_START"], "</TD><TD>", (_siteData[0])["COVERAGE"], "</TD>" );
				for ( _l = 0; _l < numRates; _l = _l + 1 ) {
					fprintf ( stdout, "<TD>", Format ( (_siteData[_l])["POSTERIOR"], f1, f2 ), "</TD>" );
				}
				fprintf ( stdout, "</TR>" );
			}
			fprintf ( stdout, "</TABLE></DIV>" );
		}
	}
		
	if ( !_option_output ) {
		fprintf ( stdout, "<DIV class='RepClassSM'>" );
		fscanf ( "../Formats/uds_report_neb", "Raw", _legend );
		fprintf ( stdout, _legend, "</DIV>" );
		
	}
	
	
}
if ( _in_reportType == 3 ) {
	NUC_LETTERS		= "ACGT";
	codonMap = {};
	CODONS = {64,1};
	for ( p1=0;p1<64;p1=p1+1) {
		codon = NUC_LETTERS[p1$16]+NUC_LETTERS[p1%16$4]+NUC_LETTERS[p1%4];
		CODONS[p1] = NUC_LETTERS[p1$16]+NUC_LETTERS[p1%16$4]+NUC_LETTERS[p1%4];
		ccode = _Genetic_Code[p1];
		codonMap[codon] = _hyphyAAOrdering[ccode];
	}
	
	if ( _in_dodr ) {
		if ( !_option_output ) {
			fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS='SuccessCap'>Sitewise drug resistance results: ", _in_gene, "; site ", _in_site, "</H1>\n");
			
			_recordsFound = {};
			DoSQL ( DBID, "SELECT * FROM AA_ALIGNMENT WHERE (POSITION='" + _in_site + "' AND INDEL_POSITION='0');", "return _matchRecordsByField (0);" );
			aa_site = _recordsFound;
			
			siteCov 	= 0 + (aa_site[0])["COVERAGE"];
			conAA		= (aa_site[0])["CONSENSUS_AA"];
			
			outPATH = spoolPATH + ".aaprofile." + _in_site + ".fas";
			fprintf ( outPATH, CLEAR_FILE, createSiteProfile ( aa_site ) );
			siteFile = _in_filePrefix + ".aaprofile." + _in_site + ".fas";
			
			fprintf ( stdout, "<DIV class='RepClassSM'>" );
			
			
			_recordsFound = {};
			DoSQL ( DBID, "SELECT * FROM MDR_VARIANTS WHERE SITE_GENE_START='" + _in_site + "'", "return _matchRecordsByField (0);" );
			mdr_info = _recordsFound;
			
			fprintf ( stdout, "List of known drug resistant mutations at the site:<br/><br/>" );
			_c = 0;
			abList = {};
			for ( _k = 0; _k < Abs ( mdr_info ); _k = _k + 1 ) {
				if ( _k == 0 ) {
					fprintf ( stdout, "<TABLE BORDER='0'><TR CLASS = 'TRReport' style = 'font-size:small'><TH>site</TH><TH>class</TH><TH>residue</TH><TH>drug</TH><TH>score</TH><TH>additional information</TH></TR>" );
				}
				dScoreArray = splitOnRegExp( (mdr_info[_k])["DRUG_REPORT"], ":" );
				for ( _l = 0; _l < Abs ( dScoreArray ); _l = _l + 1 ) {
					aArray = splitOnRegExp ( dScoreArray [ _l ], " " );
					fprintf ( stdout, "<TR CLASS = 'TRReport",(_l%2)+1,"' style = 'font-size:x-small'><TD>",(mdr_info[_k])["MDR_SITE"],"</TD><TD>", (mdr_info[_k])["DRUG_CLASS"],"</TD><TD>",aArray[0],"</TD><TD>", aArray[2],"</TD><TD>", aArray[1] ,"</TD><TD><a href ='", drugLinks[aArray[2]], "'>Stanford DB</a></TD></TR>" );
					if ( Abs ( abList[aArray[2]] ) == 0 ) {
						abList[_c] = aArray[2];
						_c = _c + 1;
					}
				}
			}
			fprintf ( stdout, "</TABLE><br/>" );

			_recordsFound = {};
			DoSQL ( DBID, "SELECT min(mu_rate) FROM MU_RATE_CLASSES WHERE AIC=(SELECT min(AIC) FROM MU_RATE_CLASSES);", "return _matchRecordsByField (0);" );
			_minRate = 0 + _recordsFound[0];

			drawResidueTable();
			
			fprintf ( stdout, "<br/>Save as <a href='", BASE_CGI_URL_STRING, "toggleSiteMap.pl?file=", siteFile, "&site=1&aa=F&genCodeID=0&mode=1&doLogo=1&doPDF=1'>[PDF]</a><br/>" );
			fprintf ( stdout, "<iframe name = 'pdf_frame' src='", BASE_CGI_URL_STRING, "toggleSiteMap.pl?file=", siteFile, "&site=1&aa=F&genCodeID=0&mode=1&doLogo=1' width='200px' height = '200px' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );

			fprintf ( stdout, "<br/>Sequence logo drawn using WebLogo <a href = 'http://weblogo.berkeley.edu/' target='_blank'>(weblogo.berkeley.edu)</a>" );
			fprintf ( stdout, "</DIV>" );	
			
			fprintf ( stdout, "<DIV class='RepClassSM'>" );
			fprintf ( stdout, "<p><span style = 'color:white;background-color:black;'>abbreviations</span><p>" );
			fprintf ( stdout, "<TABLE>" );
			for ( _k = 0; _k < Abs ( abList ); _k = _k + 1 ) {
				fprintf ( stdout, "<TR CLASS='TRReportNT'><TD>", abList[_k],"</TD><TD>", drugNames[abList[_k]],"</TD></TR>" );
			}
			fprintf ( stdout, "</TABLE><br/>" );
			
			fscanf ( "../Formats/uds_report_inddrsites", "Raw", _legend );
			fprintf ( stdout, _legend, "</DIV>" );
		
		}
	}
	else {
		if ( !_option_output ) {
			fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS='SuccessCap'>Sitewise mutation rate results: ", _in_gene, "; site ", _in_site, "</H1>\n");
			
			_recordsFound = {};
			DoSQL ( DBID, "SELECT * FROM AA_ALIGNMENT WHERE (POSITION='" + _in_site + "' AND INDEL_POSITION='0');", "return _matchRecordsByField (0);" );
			aa_site = _recordsFound;
			
			siteCov = 0 + (aa_site[0])["COVERAGE"];
			conAA		= (aa_site[0])["CONSENSUS_AA"];
			
			outPATH = spoolPATH + ".aaprofile." + _in_site + ".fas";
			fprintf ( outPATH, CLEAR_FILE, createSiteProfile ( aa_site ) );
			siteFile = _in_filePrefix + ".aaprofile." + _in_site + ".fas";
			
			fprintf ( stdout, "<DIV class='RepClassSM'>" );
		
			_recordsFound = {};
			DoSQL ( DBID, "SELECT min(mu_rate) FROM MU_RATE_CLASSES WHERE AIC=(SELECT min(AIC) FROM MU_RATE_CLASSES);", "return _matchRecordsByField (0);" );
			_minRate = 0 + _recordsFound[0];
		
			drawResidueTable ();

			fprintf ( stdout, "Save as <a href='", BASE_CGI_URL_STRING, "toggleSiteMap.pl?file=", siteFile, "&site=1&aa=F&genCodeID=0&mode=1&doLogo=1&doPDF=1'>[PDF]</a><br/>" );
			fprintf ( stdout, "<iframe name = 'pdf_frame' src='", BASE_CGI_URL_STRING, "toggleSiteMap.pl?file=", siteFile, "&site=1&aa=F&genCodeID=0&mode=1&doLogo=1' width='200px' height = '200px' align = 'middle' frameborder='1' marginwidth='10'></iframe><br/><br/>" );

			fprintf ( stdout, "Sequence logo drawn using WebLogo <a href = 'http://weblogo.berkeley.edu/' target='_blank'>(weblogo.berkeley.edu)</a>" );
			fprintf ( stdout, "</DIV>" );	
			
			fprintf ( stdout, "<DIV class='RepClassSM'>" );
			fscanf ( "../Formats/uds_report_indsites", "Raw", _legend );
			fprintf ( stdout, _legend, "</DIV>" );

		}
	}
}

if ( _in_reportType == 4 ) { /* report the empirical bayes results*/

	PTABLE = "SITE_POSTERIORS";

	if ( !_option_output ) {
		fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS='SuccessCap'>Sitewise rate class assignments: ", _in_gene, "</H1>\n");
	}
	_recordsFound = {};
	DoSQL ( DBID, "SELECT max(RATE_CLASS) FROM " + PTABLE + "", "return _matchRecordsByField (0);" );
	numRates = (0 + _recordsFound[0]) + 1;
	
	_recordsFound = {};
	DoSQL ( DBID, "SELECT DISTINCT SITE FROM " + PTABLE + "", "return _matchRecordsByField (0);" );
	sites = _recordsFound;
	
	for ( _k = 0; _k < Abs ( sites ); _k = _k + 1 ) {
		zeSite = 0 + sites[_k];
	
		_recordsFound = {};
		DoSQL ( DBID, "SELECT * FROM " + PTABLE + " WHERE SITE='" + zeSite + "';", "return _matchRecordsByField (1);" );	
		_siteData = _recordsFound;
		
		_recordsFound = {};
		DoSQL ( DBID, "SELECT POSTERIOR,RATE_CLASS FROM " + PTABLE + " WHERE (SITE='" + zeSite + "' AND POSTERIOR=(SELECT max(POSTERIOR) FROM " + PTABLE + " WHERE SITE='" + zeSite + "'));", "return _matchRecordsByField (1);" );	
		rc = 0 + (_recordsFound[0])["RATE_CLASS"];
		posterior = 0 + (_recordsFound[0])["POSTERIOR"];
		rowString = "";
		if ( ( rc == 0 ) || posterior < 0.95 ) {
			rowString = "NT";
		}
		else {
			rowString = "PS";
		}
		
		if ( _option_output ) { /*CSV*/
			if ( _k == 0 ) {
				fprintf ( stdout, "site,coverage" );
				for ( _l = 0; _l < numRates; _l = _l + 1 ) {
					fprintf ( stdout, ",posterior_rt_", (_siteData[_l])["RATE"], "_wt_", (_siteData[_l])["WEIGHT"] );
				}
				fprintf ( stdout, "\n" );
			}	
			fprintf ( stdout, (_siteData[0])["SITE"], ",", (_siteData[0])["COVERAGE"] );
			for ( _l = 0; _l < numRates; _l = _l + 1 ) {
				fprintf ( stdout, ",", Format ( (_siteData[_l])["POSTERIOR"], f1, f2 ) );
			}
			fprintf ( stdout, "\n" );
		}	
		else { /*HTML*/
			if ( _k == 0 ) {
				fprintf ( stdout, "<DIV class='RepClassSM'>" );
				fprintf ( stdout, "<TABLE BORDER='0' align='center'><TR CLASS='TRReport' style='font-size:small'><TH></TH><TH>site</TH><TH>cvg</TH>" );
				for ( _l = 0; _l < numRates; _l = _l + 1 ) {
					fprintf ( stdout, "<TH>posterior_",_l,"</TH>" );
				}
				fprintf ( stdout, "</TR>" );
				fprintf ( stdout, "<TR CLASS='TRReportNT'><TH bgcolor='#CCCCCC'><b>rate:</b></TH><TH bgcolor='#CCCCCC'></TH><TH bgcolor='#CCCCCC'></TH>" );
				for ( _l = 0; _l < numRates; _l = _l + 1 ) {
					fprintf ( stdout, "<TH bgcolor='#CCCCCC'>", (_siteData[_l])["RATE"], "</TH>" );
				}
				fprintf ( stdout, "</TR>" );
				fprintf ( stdout, "<TR CLASS='TRReportNT'><TH bgcolor='#CCCCCC'><b>weight:</b></TH><TH bgcolor='#CCCCCC'></TH><TH bgcolor='#CCCCCC'></TH>" );
				for ( _l = 0; _l < numRates; _l = _l + 1 ) {
					fprintf ( stdout, "<TH bgcolor='#CCCCCC'>", (_siteData[_l])["WEIGHT"], "</TH>" );
				}
				fprintf ( stdout, "</TR><TR><TD></TD></TR>" );
				
				
				
			}
			fprintf ( stdout, "<TR CLASS='TRReport",rowString,"' style = 'font-size:x-small'><TD bgcolor='#CCCCCC'></TD><TD>", (_siteData[0])["SITE"], "</TD><TD>", (_siteData[0])["COVERAGE"], "</TD>" );
			for ( _l = 0; _l < numRates; _l = _l + 1 ) {
				fprintf ( stdout, "<TD>", Format ( (_siteData[_l])["POSTERIOR"], f1, f2 ), "</TD>" );
			}
			fprintf ( stdout, "</TR>" );
		}
	}
	if ( !_option_output ) {
		fprintf ( stdout, "</TABLE><br/><br/>" );
		fscanf ( "../Formats/uds_report_neb", "Raw", _legend );
		fprintf ( stdout, _legend, "</DIV>" );
	}

}

if ( _in_reportType == 5 ) {

	if ( !_option_output) {
		fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS='SuccessCap'>Compensatory drug mutation results: ", _in_gene, "</H1>\n");
	}
	_recordsFound = {};
	DoSQL ( DBID, "SELECT DISTINCT PRIMARY_SITE,SECONDARY_SITE FROM ACCESSORY_MUTATIONS ORDER BY PRIMARY_SITE;", "return _matchRecordsByField (1);" );	
	_compPairs = _recordsFound;
	ct = 0;
	lastPrimary = 0;
	for ( _k = 0; _k < Abs ( _compPairs ); _k = _k + 1 ) {	
		_recordsFound = {};
		DoSQL ( DBID, "SELECT * FROM ACCESSORY_MUTATIONS WHERE (PRIMARY_SITE='" + (_compPairs[_k])["PRIMARY_SITE"] + "' AND SECONDARY_SITE='" + (_compPairs[_k])["SECONDARY_SITE"] + "')", "return _matchRecordsByField (1);" );	
		_readsWithPair = _recordsFound;
		
		_recordsFound = {};
		DoSQL ( DBID, "SELECT DISTINCT PRIMARY_RT,SECONDARY_RT FROM ACCESSORY_MUTATIONS WHERE (PRIMARY_SITE='" + (_compPairs[_k])["PRIMARY_SITE"] + "' AND SECONDARY_SITE='" + (_compPairs[_k])["SECONDARY_SITE"] + "');", "return _matchRecordsByField (1);" );
		_drSites = _recordsFound;
		
		checkSite = {};
		checkSite["PRIMARY"] 	= {};
		checkSite["SECONDARY"] 	= {};

		for ( _r = 0; _r < Abs ( _drSites ); _r = _r + 1 ) {
			ExecuteCommands ( "(checkSite[\"PRIMARY\"])[\"" + (_drSites[_r])["PRIMARY_RT"] + "\"] = 1;" );
			ExecuteCommands ( "(checkSite[\"SECONDARY\"])[\"" + (_drSites[_r])["SECONDARY_RT"] + "\"] = 1;" );
		}
		
		pairArray = { Abs (_hyphyAAOrdering), Abs (_hyphyAAOrdering) };
		
		for ( _l = 0; _l < Abs ( _readsWithPair ); _l = _l + 1 ) {
			if ( (_readsWithPair[_l])["PRIMARY_OBS"] != "-" && (_readsWithPair[_l])["SECONDARY_OBS"] != "-" ) {
				pairArray[ _aaLetterToCode[(_readsWithPair[_l])["PRIMARY_OBS"]] ][ _aaLetterToCode[(_readsWithPair[_l])["SECONDARY_OBS"]] ] = pairArray[ _aaLetterToCode[(_readsWithPair[_l])["PRIMARY_OBS"]] ][ _aaLetterToCode[(_readsWithPair[_l])["SECONDARY_OBS"]] ] + 1;
			}
		}
		
		if ( !_option_output ) {
			if ( _k == 0 ) {
				fprintf ( stdout, "<DIV class='RepClassSM'>The following pairs of drug resistant and accessory sites were found on the same reads. Primary and secondary drug resistant residues are highlighted in red. Note that the residue is identified as drug resistant in association with the resdiue at the secondary site. For instance, in reverse transcriptase,  Asparagine (N) at site 103 is a known drug resistant residue, but will only be labelled as drug resistant in this table if it has a corresponding compensatory mutation site specifically for Asparagine (N) at site 103. A compensatory mutation for Asparagine (N) at site 103 is Isoleucine (I) at site 100. However, for Arginine (R) at site 103 a compensatory mutation is Aspartic acid (D) at site 179, whereas the latter is not a compensatory mutation for Asparagine (N) at site 103. In this instance N103 will be red when associated 100, but not with 179. For example:" );
				fprintf ( stdout, "<TABLE BORDER='0' align='center'><TR CLASS='TRReport' style='font-size:small'><TH>primary</TH><TH>primary residue</TH><TH>secondary</TH><TH>secondary residue</TH><TH>num reads</TH></TR>" );
				fprintf ( stdout, "<TR CLASS='TRReport1' style = 'font-size:x-small'><TH>103</TH><TH><b><font color='#FF0000'>N</font></b></TH><TH>100</TH><TH><b><font color='#FF0000'>I</font></b></TH><TH>10</TH></TR>" );							
				fprintf ( stdout, "<TR CLASS='TRReport2' style = 'font-size:x-small'><TH>103</TH><TH><b><font color='#FF0000'>N</font></b></TH><TH>100</TH><TH>D</TH><TH>10</TH></TR>" );
				fprintf ( stdout, "<TR CLASS='TRReport1' style = 'font-size:x-small'><TH>103</TH><TH>N</TH><TH>179</TH><TH><b><font color='#FF0000'>D</font></b></TH><TH>10</TH></TR>" );
				fprintf ( stdout, "<TR CLASS='TRReport2' style = 'font-size:x-small'><TH>103</TH><TH><b><font color='#FF0000'>R</font></b></TH><TH>179</TH><TH><b><font color='#FF0000'>D</font></b></TH><TH>10</TH></TR>" );
				fprintf ( stdout, "<br/><br/></TABLE></DIV>" );
				fprintf ( stdout, "<DIV class='RepClassSM'>Download results: <a href='",BASE_CGI_URL_STRING,"udsReport.pl?file=",_in_filePrefix,"&report_type=5&gene=",_in_gene,"&outmode=1' target = '_blank'>[CSV]</a><br/><br/><TABLE BORDER='0' align='center'><TR CLASS='TRReport' style='font-size:small'><TH>primary</TH><TH>primary residue</TH><TH>secondary</TH><TH>secondary residue</TH><TH>num reads</TH></TR>" );
			
			
			}
			else {
				if ( lastPrimary != (0 + (_compPairs[_k])["PRIMARY_SITE"] ) ) {
					fprintf ( stdout, "<TR CLASS='TRReport' bgcolor='#CCCCCC' style = 'font-size:x-small'><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></TR>" );
					fprintf ( stdout, "<TR CLASS='TRReport' bgcolor='#CCCCCC' style = 'font-size:x-small'><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></TR>" );
				}
			}
			
			for ( _l = 0; _l < Abs ( _hyphyAAOrdering); _l = _l + 1 ) {
				for ( _m = 0; _m < Abs ( _hyphyAAOrdering ); _m = _m + 1 ) {
					if ( pairArray [ _l ][ _m ] > 0 ) {
						ExecuteCommands ( "checkPrimary 	= (checkSite[\"PRIMARY\"])[\"" + _hyphyAAOrdering[_l] + "\"];" );
						ExecuteCommands ( "checkSecondary 	= (checkSite[\"SECONDARY\"])[\"" + _hyphyAAOrdering[_m] + "\"];" );

						if ( checkPrimary  || checkSecondary ) {
							if ( checkPrimary && checkSecondary ) {
								fprintf ( stdout, "<TR CLASS='TRReport",(ct%2)+1,"' style = 'font-size:x-small'><TD>", (_compPairs[_k])["PRIMARY_SITE"],"</TD><TD><b><font color='#FF0000'>", _hyphyAAOrdering[_l],"</font></b></TD><TD>", (_compPairs[_k])["SECONDARY_SITE"],"</TD><TD><b><font color='#FF0000'>", _hyphyAAOrdering[_m],"</font></b></TD><TD>", pairArray [ _l ][ _m ],"</TD></TR>" );
							}
							else {
								if ( checkPrimary )  {
									fprintf ( stdout, "<TR CLASS='TRReport",(ct%2)+1,"' style = 'font-size:x-small'><TD>", (_compPairs[_k])["PRIMARY_SITE"],"</TD><TD><b><font color='#FF0000'>", _hyphyAAOrdering[_l],"</font></b></TD><TD>", (_compPairs[_k])["SECONDARY_SITE"],"</TD><TD>", _hyphyAAOrdering[_m],"</TD><TD>", pairArray [ _l ][ _m ],"</TD></TR>" );
								}	
								else {
									fprintf ( stdout, "<TR CLASS='TRReport",(ct%2)+1,"' style = 'font-size:x-small'><TD>", (_compPairs[_k])["PRIMARY_SITE"],"</TD><TD>", _hyphyAAOrdering[_l],"</TD><TD>", (_compPairs[_k])["SECONDARY_SITE"],"</TD><TD><b><font color='#FF0000'>", _hyphyAAOrdering[_m],"</font></b></TD><TD>", pairArray [ _l ][ _m ],"</TD></TR>" );
								}
							}
						}
						else {
							fprintf ( stdout, "<TR CLASS='TRReport",(ct%2)+1,"' style = 'font-size:x-small'><TD>", (_compPairs[_k])["PRIMARY_SITE"],"</TD><TD>", _hyphyAAOrdering[_l],"</TD><TD>", (_compPairs[_k])["SECONDARY_SITE"],"</TD><TD>", _hyphyAAOrdering[_m],"</TD><TD>", pairArray [ _l ][ _m ],"</TD></TR>" );
						}
						ct = ct + 1;
					}
				}
			}
		}
		else { /*print CSV*/
			if ( _k == 0 ) {
				fprintf ( stdout, "primary_site,primary_residue,secondary_site,secondary_residue,number_of_reads\n" );
			}
			for ( _l = 0; _l < Abs ( _hyphyAAOrdering); _l = _l + 1 ) {
				for ( _m = 0; _m < Abs ( _hyphyAAOrdering ); _m = _m + 1 ) {
					if ( pairArray [ _l ][ _m ] > 0 ) {
						fprintf ( stdout, (_compPairs[_k])["PRIMARY_SITE"],",", _hyphyAAOrdering[_l],",", (_compPairs[_k])["SECONDARY_SITE"],",", _hyphyAAOrdering[_m],",", pairArray [ _l ][ _m ],"\n" );
					}
				}
			}
		}
		lastPrimary = (0 + (_compPairs[_k])["PRIMARY_SITE"] );
	}
	if ( ct > 0 ) {
		fprintf ( stdout, "</TABLE></DIV>" );
	}
}


DoSQL ( SQL_CLOSE, "", DBID );


/*---------------------------------------------------------------------*/


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

/*---------------------------------------------------------------------*/

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

function createSiteProfile ( _avl ) {

	dataString = "";
	dataString * 0;
	id = 0;
	for ( _c = 0; _c < 64; _c = _c + 1 ) {
		codonCount = 0 + (_avl[0])[CODONS[_c]];
		for ( _d = 0; _d < codonCount; _d = _d + 1 ) {
			dataString * ( "> id_" + id + "\n" + codonMap[CODONS[_c]] + "\n" );
			id = id + 1;
		}
	}
	return dataString;
}

function merge (key,value)
{
	if (Abs(positionList[key])==0)
	{
		positionList[key] = value;
	}
	return 0;
}

function drawResidueTable () {
	fprintf ( stdout, "The following residues and codons were observed at the site:<p/>" );
    fprintf ( stdout, "<TABLE BORDER='0'>" );		
    aa_profile   = { 21, 2 };
    codons_by_aa = {};
    for ( _k = 0; _k < 64; _k = _k + 1 ) {
        codon_count =  0 + (aa_site[0])[CODONS[_k]];
        if ( codon_count ) {
            aa_code =  _Genetic_Code [ _k  ];
            aa_profile [ aa_code ][0] = aa_profile [ aa_code ][0] + codon_count;
            if (Abs(codons_by_aa[aa_code]) == 0) {
                codons_by_aa[aa_code] = {};
            }
            (codons_by_aa[aa_code]) [CODONS[_k]] = codon_count;
            aa_profile[aa_code][1] = aa_code;
        }
    }
    fprintf ( stdout, "<TR CLASS = 'TRReport' style = 'font-size:14px'><TH>residue</TH><TH>count</TH><TH>proportion</TH><TH>P</TH></TR>" );
    kcount = 0;
    aa_profile = aa_profile % 0;
    for ( _k = 20; _k >= 0; _k = _k - 1 ) {
        res_count = aa_profile [_k][0];
        if ( res_count == 0 ) {
            break;
        }
        _k2 = aa_profile[_k][1];
        if ( _hyphyAAOrdering [_k2] == conAA ) {
            bprob = "N/A";
        }
        else {
            bprob = 0;
            for (_k3 = 0; _k3 < res_count; _k3+=1) {
                bprob += Exp ( binomialP (_minRate, siteCov, _k3));
                if (bprob > 0.9999) {
                    break;
                }
            }
            bprob = Format ( 1-bprob, 2, 3);
        }
        fprintf ( stdout, "<TR CLASS='TRReport",kcount+1,"' style = 'font-size:12px'><TD style='text-align:left'>", _hyphyAAOrdering [_k2], " (", _singleAALetterToFullName[_hyphyAAOrdering [_k2]],")</TD><TD>", res_count,"</TD><TD>", Format ( res_count/siteCov, 3, 2 ), 
        "</TD><TD>", bprob,"</TD></TR>" );
        
        (codons_by_aa[_k2])["printCodonCount"][""];
        
        kcount = !kcount;
    }
    fprintf ( stdout, "</TABLE><br/>" );
    return 0;
}

function printCodonCount (key, value) {
      fprintf ( stdout, "<TR CLASS='TRReport",kcount+1,"' style = 'font-size:11px; font-style:italic;'><TD style='text-align:right'>",key,"</TD><TD>", value,"</TD><TD>", Format ( (0+value)/res_count, 3, 2 ), 
    "</TD><TD>--</TD></TR>" );           
    return 0;   
}