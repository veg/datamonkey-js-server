RequireVersion  ("0.9920060815");

fscanf	(stdin, "Number", _in_GeneticCodeTable);
fscanf	(stdin, "String", _in_ModelDescription);
fscanf	(stdin, "String", _in_FilePath);
fscanf	(stdin, "Number", _in_dNdSOptions);
fscanf	(stdin, "Number", _in_dNdSValue);
fscanf	(stdin, "Number", _in_dNdSAmbigs);
fscanf	(stdin, "Number", _in_dNdSPValue);
fscanf	(stdin, "Number", _treeMode);

timer = Time(0);

skipCodeSelectionStep 		   = 1;
_onlyDoAncestralReconstruction = 1;

ExecuteAFile("../Shared/DBTools.ibf");
ExecuteAFile("../Shared/GrabBag.bf");

if (_in_GeneticCodeTable >= 0)
{
	ExecuteAFile("../Shared/chooseGeneticCode.def");
	ApplyGeneticCodeTable (_in_GeneticCodeTable);
}
else
{
	if (_in_GeneticCodeTable == (-2))
	{
		if ((_in_ModelDescription$"\\+F$")[0] >= 0)
		{
			SKIP_FREQ_HARVESTING = 1;
			_aaModelName   = _in_ModelDescription[0][Abs(_in_ModelDescription)-3];
			_aaFreqOptions = "Estimated"; 
		}
		else
		{
			_aaModelName   = _in_ModelDescription;
			_aaFreqOptions = "Empirical"; 
		}
	}
}
ExecuteAFile ("../Shared/_MFReader_.ibf");
filePrefix = filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"];

slacDBID = _openCacheDB      (filePrefix);

intermediateHTML = BASE_OUTPUT_PATH + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "_bgm.txt";
finalPHP		 = BASE_OUTPUT_PATH + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "_bgm.php";

fprintf			   (intermediateHTML, CLEAR_FILE);
tExists			   = _TableExists (slacDBID, "BGM_MODEL");
if (tExists)
{
	mapMutations = (_ExecuteSQL(slacDBID,"SELECT Model FROM BGM_MODEL"))[0]!=_in_ModelDescription;
}

if (_in_GeneticCodeTable >= 0) /* codon data */
{
	dataType = 0;
	mapMutations	=  mapMutations || (_TableExists (slacDBID,"SLAC_MUTATION") == 0);

	if (mapMutations)
	{
		ExecuteAFile 	("qndhelper1_mf.ibf");
		rOptions    	= 5;
		global dNdS 	= 1;

		ExecuteAFile 		("qndhelper2_mf.ibf");

		pooledFreqs 		= {4,1};

		for (k=0; k<4; k=k+1)
		{
			pooledFreqs[k] = (positionFrequencies[k][0]+positionFrequencies[k][1]+positionFrequencies[k][2])/3;
		}

		_EFV_MATRIX0_ 		= {{1,AC__*pooledFreqs[1],pooledFreqs[2],AT__*pooledFreqs[3]}
							  {AC__*pooledFreqs[0],1,CG__*pooledFreqs[2],CT__*pooledFreqs[3]}
							  {pooledFreqs[0],CG__*pooledFreqs[3],1,GT__*pooledFreqs[3]}
							  {AT__*pooledFreqs[0],CT__*pooledFreqs[3],GT__*pooledFreqs[2],1}};

		_EFV_MATRIX1_ 		= _EFV_MATRIX0_;
		_EFV_MATRIX2_ 		= _EFV_MATRIX0_;			

		fprintf 			(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 3</b> Reconstructing ancestors and counting substitutions.", CLOSE_FILE);

		SLAC_MutationTable = {};
		SLAC_MutationTable ["Partition"] 		 = "INTEGER";
		SLAC_MutationTable ["Branch"]    		 = "STRING";
		SLAC_MutationTable ["Site"]    	 		 = "INTEGER";
		SLAC_MutationTable ["AbsSite"]    	 	 = "INTEGER";
		SLAC_MutationTable ["StartCodon"]    	 = "STRING";
		SLAC_MutationTable ["EndCodon"]    	 	 = "STRING";
		SLAC_MutationTable ["StartAA"]    	 	 = "STRING";
		SLAC_MutationTable ["EndAA"]    	 	 = "STRING";
		SLAC_MutationTable ["NS"]    	 	 	 = "REAL";
		SLAC_MutationTable ["S"]    	 	 	 = "REAL";

		_CheckDBID 				(slacDBID,"SLAC_MUTATION",SLAC_MutationTable);

		useCustomCountingBias 		= 1;
		ExecuteAFile			("SGEmulator_MF.bf");

		SLAC_TreeTable = {};
		SLAC_TreeTable ["Partition"] = "INTEGER";
		SLAC_TreeTable ["Tree"] = "STRING";

		_CheckDBID (slacDBID,"SLAC_TREES",SLAC_TreeTable);
		
		record = {};

		for (k = 1; k<=fileCount; k=k+1)	
		{	
			ExecuteCommands ("_treeString=Format(codonTree_"+k+",1,1);");
			record ["Partition"] = k;record ["Tree"] = _treeString;_InsertRecord (slacDBID,"SLAC_TREES", record);
		}
	}
}
else
{
	mapMutations	=  mapMutations || (_TableExists (slacDBID,"SUBSTITUTIONS") == 0);
	if (mapMutations)
	{
		SLAC_MutationTable = {};
		SLAC_MutationTable ["Partition"] 		 = "INTEGER";
		SLAC_MutationTable ["Branch"]    		 = "STRING";
		SLAC_MutationTable ["Site"]    	 		 = "INTEGER";
		SLAC_MutationTable ["AbsSite"]    	 	 = "INTEGER";
		SLAC_MutationTable ["StartResidue"]    	 = "STRING";
		SLAC_MutationTable ["EndResidue"]    	 = "STRING";

		_CheckDBID 			(slacDBID,"SUBSTITUTIONS",SLAC_MutationTable);

		ExecuteAFile 	("qndhelper1_mf.ibf");
		ExecuteAFile 	("qndhelper2_mf.ibf");

		fprintf 			(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 2</b> Reconstructing ancestors and counting substitutions.", CLOSE_FILE);

		ExecuteAFile("../Shared/AncestralMapper.bf");
		ac 			= _buildAncestralCache ("nucLF",0);
		
		_bacSiteC   			= {};
		_bacSiteC ["CHARS"] 	= (_ancestralRecoveryCache[ac])["CHARS"];
		_bacSiteDim 			= Columns (_bacSiteC ["CHARS"]);
		_bacCounter 			= Rows ((_ancestralRecoveryCache[ac])["MATRIX"])-1;
		siteCount				= Columns ((_ancestralRecoveryCache[ac])["MATRIX"]);
		
		aRecord					= {};
		aRecord	["Partition"] 	= 1;
		for (_bgmIndexer = 0; _bgmIndexer < siteCount; _bgmIndexer = _bgmIndexer+1)
		{
			_thisColumn 		= ((_ancestralRecoveryCache[ac])["MATRIX"])[-1][_bgmIndexer];
			aRecord	["Site"] 	= _bgmIndexer+1;
			aRecord	["AbsSite"] = aRecord	["Site"];
			
			for (_bacTreeIterator = 0; _bacTreeIterator < _bacCounter; _bacTreeIterator = _bacTreeIterator + 1)
			{
				_bacParentID 			= (((_ancestralRecoveryCache[ac])["TREE_AVL"])[_bacTreeIterator+1])["Parent"]-1;
				_myState	 			= _thisColumn[_bacTreeIterator];
				_pState		 			= _thisColumn[_bacParentID];
				hasSubs					= 0;
				if (_myState >= 0 && _pState >= 0)
				{
					hasSubs = (_myState != _pState);
				}
				else
				{
					_bacSiteMx				= {_bacSiteDim,_bacSiteDim};
					_expandSubstitutionMap 	(_pState,_myState,ac,"_bacSiteMx");
					hasSubs = Max(_bacSiteMx$(_bacSiteMx["_MATRIX_ELEMENT_ROW_!=_MATRIX_ELEMENT_COLUMN_"]),0);
				}
				if (hasSubs)
				{
					aRecord["Branch"] = (((_ancestralRecoveryCache[ac])["TREE_AVL"])[_bacTreeIterator+1])["Name"];
					aRecord["StartResidue"] = _convertStateToChar (_pState,ac);
					aRecord["EndResidue"]   = _convertStateToChar (_myState,ac);
					_InsertRecord (slacDBID,"SUBSTITUTIONS", aRecord);
				}
			}
		}


		SLAC_TreeTable = {};
		SLAC_TreeTable ["Partition"] = "INTEGER";
		SLAC_TreeTable ["Tree"] 	 = "STRING";

		_CheckDBID (slacDBID,"SLAC_TREES",SLAC_TreeTable);
		
		record = {};

		for (k = 1; k<=fileCount; k=k+1)	
		{	
			ExecuteCommands ("_treeString=Format(nucTree_"+k+",1,1);");
			record ["Partition"] = k;record ["Tree"] = _treeString;_InsertRecord (slacDBID,"SLAC_TREES", record);
		}
	}
}

/* generate result output */

fscanf	("../Formats/phphead","Raw",phpHead);
phpHead = phpHead ^ {{"_REPLACE_DOCUMENT_TITLE","\"BGM stage 1 results\""}};
phpHead = phpHead ^ {{"DM_print_html_head\\(\\)","DM_print_html_head_on_load_img('countSelected()','spidermonkey.png',144)"}};

fscanf	("../Formats/phpfoot","Raw",phpFoot);

fprintf (finalPHP,CLEAR_FILE,KEEP_OPEN,phpHead,"<H1 CLASS='SuccessCap'>Spidermonkey/BGM analysis setup</H1>");

jobFileName = BASE_CGI_URL_STRING + "slacreport.pl?file=" + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "&amp;format=";

fprintf 		  (finalPHP, jobIDDIV);

_substitutionReport = {};
_branchMap			= {};
_siteMap			= {};

if (_in_GeneticCodeTable >= 0) /* codon data */
{
	DoSQL 				(DB_ID, "SELECT Branch,Site,NS,S FROM 'SLAC_MUTATION'", "return _substitutionReporter(0)");
}
else
{
	DoSQL 				(DB_ID, "SELECT Branch,Site FROM 'SUBSTITUTIONS'", "return _substitutionReporterNucProt(0)");
}

nvar 			  = Abs(_siteMap);
nobs			  = Abs(_branchMap);
total			  = Abs(_substitutionReport);

_siteIndexer	  = Rows (_siteMap);


if (nvar < 2 || nobs < 2)
{
	ErrorOut ("The mutation matrix must contain at least 2 rows and columns to be conducive to a meaningful BGM analysis");
	return	  0;
}

dataMx = {nobs, nvar};

for (k=0; k<total; k=k+1)
{
	k2 = _substitutionReport[k];
	dataMx [k2[0]][k2[1]]  = 1;
}

colsums = ({1,nobs}["1"])* /* this creates a row vector and populates it with 1's */
		  dataMx;
/* 
   compute the number of substitutions 
   events per branch by computing column sums
*/ 

total 			= (colsums * {nvar,1}["1"])[0];
subs_freq		= colsums["_MATRIX_ELEMENT_VALUE_/nobs"];
entropy			= subs_freq["-(_MATRIX_ELEMENT_VALUE_*Log(_MATRIX_ELEMENT_VALUE_)+(1-_MATRIX_ELEMENT_VALUE_)*Log(1-_MATRIX_ELEMENT_VALUE_))"]*(1/Log(2));

/* compute frequencies of substitutions/site/branch and entropies/site */

dataAdjective = returnDataAdjective (_in_GeneticCodeTable,1);


fprintf		  (finalPHP, "<DIV class = 'RepClassSM'>Mapped <b>", total, "</b> ",dataAdjective," substitutions over <b>", 
							nvar, "</b> sites to <b>", nobs, "</b> branches in the tree using the <i>",_in_ModelDescription,"</i> model <a href='",jobFileName,"3'>[details]</a><p>",
							"To begin a site-covariation analysis please select those sites that you wish to consider, keeping in mind that the complexity of the analysis grows non-linearly in the number of sites. Spidermonkey has already filtered out all sites where no ",dataAdjective," substitutions were inferred.</DIV>"
);

/* network type */

fprintf (finalPHP, "\n<script type='text/javascript' src='http://www.datamonkey.org/js/bgm_togglers.js'></script> <script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script><script type='text/javascript'>totalAvailableSites=",nvar,";</script>");

fprintf (finalPHP, "<FORM name = 'optionsForm' method = 'POST' action = '", BASE_CGI_URL_STRING,"BGM_step2.pl'><DIV class = 'RepClassSM' id = 'bgmOptionsDIV'>",
					"\nNetwork type:\n<SELECT NAME = 'network' onChange = 'changeNetworkType()' ID = 'networkType'>\n<OPTION VALUE = 0>One parent, undirected<OPTION VALUE = 1 SELECTED>Two parent, directed\n</SELECT>",
					"<a href='http://www.datamonkey.org/help/spidermonkey.php#options' target = '_blank' class = 'INFO' onmouseover=\"Tip('Up to 10000 nodes for one parent<br>75 -- for two')\">Help</a>",
					"<p>Ancestral resampler<INPUT TYPE = CHECKBOX id = 'resample_box' name = 'resample'><a href='http://www.datamonkey.org/help/spidermonkey.php#options' target = '_blank' class = 'INFO' onmouseover=\"Tip('Check to run BGM over multiple ancestral state samples to account for their uncertainty')\">Help</a>",
					"</DIV>\n");

/* set cutoff criteria/value to select sites */
fprintf (finalPHP, "<DIV class = 'RepClassSM' id = 'bgmCutoffDIV'>\n<TABLE WIDTH = '95%' CELLSPACING = '10px'><TR CLASS='ModelClass1' style = 'text-align:left'>",
				   "<TD>Select sites based on</TD><TD><SELECT NAME = 'cutoff1'>",
				   "\n<OPTION VALUE = '0' SELECTED>Count of branches with ",dataAdjective," subs\n<OPTION VALUE = '1'>Proportion of branches with ",dataAdjective," subs<OPTION VALUE = '2'>Entropy</SELECT>\n");
fprintf (finalPHP, "</TD></TR><TR CLASS='ModelClass2' style = 'text-align:left'><TD><span style = 'min-width:200px'>Use this (lower) threshold</span></TD><TD><INPUT TYPE = 'text' NAME = 'bgmCutoffValue' VALUE = '3' MAXLENGTH = '15' SIZE = '10'>");
fprintf (finalPHP, "<a href='http://www.datamonkey.org/help/spidermonkey.php#options' target = '_blank' class = 'INFO' onmouseover=\"Tip('Select all sites with attribute greater<br>than or equal to this value')\">Help</a></TD></TR><TR CLASS='ModelClass1' style = 'text-align:left;'>",
					"<TD COLSPAN = '2'><INPUT TYPE=BUTTON VALUE = 'Filter sites' onClick = 'filterSites()'><INPUT TYPE=BUTTON VALUE = 'Select All' onClick = 'toggleChecks(1)'><INPUT TYPE=BUTTON VALUE = 'Select None' onClick = 'toggleChecks(0)'></TD></TR></TABLE></DIV>\n");

fprintf (finalPHP, "<H1 class = 'ErrorCap' id = 'SelectionSummary'><span id = 'SelectionSummaryText'>Selected 0/0 sites</span></H1>");


fprintf (finalPHP, "<DIV class = 'RepClassSM'><TABLE BORDER = '0'><TR CLASS = 'TRReport' style = 'font-size:small'>");
fprintf (finalPHP, "<th>Codon</th><th>Count of branches with non-syn substitutions (BNSS)</th><th>Proportions of BNSS</th><th>Entropy</th><th>Selected</th><th>Map</th></TR>\n");

javascriptTest = "";
javascriptTest * 8192;

for (i = 0; i < nvar; i = i+1)
{
	if (colsums[i] > 0)
	{
		si = (-1)+_siteIndexer[i];
		fprintf (finalPHP, "<tr CLASS='TRReport", i%2+1, "' style = 'font-size:x-small'>\n");
		fprintf (finalPHP, "<td>", _siteIndexer[i], "</td><td>", colsums[i], "</td><td>", subs_freq[i], "</td><td>", entropy[i], 
							"</td><td><input TYPE='checkbox' ID = 'site_",i,"' NAME='chkbx",i,"' onClick = 'countSelected()' VALUE = '",si+1,"'></td>\n");
		
		javascriptTest * ("attributeArray[" + (i*3  ) + "] = " + colsums  [i]   + ";" +
						  "attributeArray[" + (i*3+1) + "] = " + subs_freq[i] + ";" +
						  "attributeArray[" + (i*3+2) + "] = " + entropy  [i] + ";\n");
		
		if (_in_GeneticCodeTable >= 0)
		{
			fprintf (finalPHP, "<TD style = 'font-size: 10px;'><a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=0'>[Codons]</a>",
								 "<a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=1'>[AA]</a>",
								 "<a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=2'>[Counts]</a>",
								 "</TD></TR>\n");
		}
		else
		{
			if (_in_GeneticCodeTable == (-1))
			{
				fprintf (finalPHP, "<TD style = 'font-size: 10px;'><a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=0&dataType=1'>[Nucleotides]</a>",
									 "<a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=2&dataType=1'>[Counts]</a>",
									 "</TD></TR>\n");
			}
			else
			{
				fprintf (finalPHP, "<TD style = 'font-size: 10px;'><a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=0&dataType=2'>[AA]</a>",
									 "<a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=2&dataType=2'>[Counts]</a>",
									 "</TD></TR>\n");
			}		
		}
	}
}

javascriptTest * 0;

fprintf (finalPHP, "\n<script type='text/javascript'>var attributeArray = [];\n",
					javascriptTest,
					"</script>");  

fprintf (finalPHP, "</TABLE><INPUT TYPE = 'hidden' NAME = 'filename' VALUE = '",filePrefix,"'>",
				   "<INPUT TYPE = 'hidden' NAME = 'sequences' VALUE = '",ds_0.species,"'>",
				   "<INPUT TYPE = 'hidden' NAME = 'genCodeID' VALUE = '",_in_GeneticCodeTable,"'>",
				   "<INPUT TYPE = 'hidden' NAME = 'partitions' VALUE = '",fileCount,"'>",
				   "<INPUT TYPE = 'hidden' NAME = 'pValue' VALUE = '",_in_dNdSPValue,"'>",
				   "</DIV></FORM>\n");

fprintf		  (finalPHP, phpFoot, CLOSE_FILE);

if (mapMutations)
{
	SLAC_ModelTable 			= {};
	SLAC_ModelTable 			["Model"] = "STRING";
	SLAC_ModelTable 			["TreeMode"] = "STRING";
	_CheckDBID 					(slacDBID,"BGM_MODEL",SLAC_ModelTable);
	record 						= {};
	record 						["Model"] = _in_ModelDescription;
	record 						["TreeMode"] = _treeMode;

	_InsertRecord 				(slacDBID,"BGM_MODEL", record);
	outFile = BASE_CLUSTER_ACCESS_PATH + (splitFilePath(_in_FilePath))["FILENAME"] + ".1.bgmfit";
	LIKELIHOOD_FUNCTION_OUTPUT = 7;
	if (_in_GeneticCodeTable >= 0)
	{
		fprintf (outFile,CLEAR_FILE, lf);
	}
	else
	{
		Export (nucLFI, nucLF);
		nucLFI = nucLFI ^ {{"LikelihoodFunction nucLF","LikelihoodFunction lf"}};
		fprintf (outFile,CLEAR_FILE, nucLFI);
	}	
}

_closeCacheDB (slacDBID);


/*---------------------------------------------*/

function _substitutionReporter (dummy)
{
	_mc = 0+SQL_ROW_DATA[2];
	if (_mc >= 1)
	{
		_b = _branchMap[SQL_ROW_DATA[0]] - 1;
		if (_b < 0)
		{
			_b = Abs (_branchMap);
			_branchMap [SQL_ROW_DATA[0]] = _b + 1;
		}
		_s = _siteMap [0+SQL_ROW_DATA[1]] - 1;
		if (_s < 0)
		{
			_s = Abs (_siteMap);
			_siteMap [0+SQL_ROW_DATA[1]] = _s + 1;
		}
		_mxv = {{_b__,_s__}};
		_substitutionReport [Abs(_substitutionReport)] = _mxv;
	}
	return 0;
}

/*---------------------------------------------*/

function _substitutionReporterNucProt (dummy)
{
	_b = _branchMap[SQL_ROW_DATA[0]] - 1;
	if (_b < 0)
	{
		_b = Abs (_branchMap);
		_branchMap [SQL_ROW_DATA[0]] = _b + 1;
	}
	_s = _siteMap [0+SQL_ROW_DATA[1]] - 1;
	if (_s < 0)
	{
		_s = Abs (_siteMap);
		_siteMap [0+SQL_ROW_DATA[1]] = _s + 1;
	}
	_mxv = {{_b__,_s__}};
	_substitutionReport [Abs(_substitutionReport)] = _mxv;
	return 0;
}

/*---------------------------------------------*/

function ErrorOut (errString)
{
	fprintf (finalPHP,CLEAR_FILE,phpHead, "<H1 class = 'ErrorCap'>BGM error</H1><DIV class = 'ErrorTagSM'>\n", errString, "\n</DIV>",phpFoot);
	return 0;
}
