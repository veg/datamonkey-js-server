RequireVersion  ("0.9920060815");

fscanf	(stdin, "String", _in_FilePath);
fscanf	(stdin, "Number", _in_GeneticCodeTable);
fscanf	(stdin, "Number", _in_dNdSPValue);
fscanf	(stdin, "String", _in_ModelDescription);
fscanf	(stdin, "Number", _treeMode);

timer = Time(0);

skipCodeSelectionStep 		   = 1;
_onlyDoAncestralReconstruction = 1;

ExecuteAFile("../Shared/DBTools.ibf");
ExecuteAFile("../Shared/GrabBag.bf");
ExecuteAFile("../Shared/chooseGeneticCode.def");
ApplyGeneticCodeTable (_in_GeneticCodeTable);

ExecuteAFile ("../Shared/_MFReader_.ibf");
filePrefix = filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"];

slacDBID = _openCacheDB      (filePrefix);

intermediateHTML = BASE_OUTPUT_PATH + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "_toggle.txt";
finalPHP		 = BASE_OUTPUT_PATH + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "_toggle.php";

fprintf			   (intermediateHTML, CLEAR_FILE);
/*check whether this file has already been processed through Toggle_Prep.bf. i.e: TOGGLE_MODEL is populated at end of batchfile */
tExists			   = _TableExists (slacDBID, "TOGGLE_MODEL");
if (tExists)
{
	/*if you want to change the model used for SLAC*/
	mapMutations = (_ExecuteSQL(slacDBID,"SELECT Model FROM TOGGLE_MODEL"))[0]!=_in_ModelDescription;	
}

if (_in_GeneticCodeTable >= 0) /* only codon data, else error message */
{
	dataType = 0;
	mapMutations	=  mapMutations || (_TableExists (slacDBID,"SLAC_MUTATION") == 0);
	/* if map mutations is true and/or SLAC_MUTATION does not exist */

	if (mapMutations) /*do the SLAC mutation mapping */
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
else {
	ErrorOut ("Toggling analysis is only possible with codon data. Please upload a codon data file.");
	return 0;
}

/* generate result output */

fscanf	("../Formats/phphead","Raw",phpHead);
phpHead = phpHead ^ {{"_REPLACE_DOCUMENT_TITLE","\"Toggle stage 1 results\""}};

fscanf	("../Formats/phpfoot","Raw",phpFoot);

_substitutionReport = {};
_branchMap			= {};
_siteMap			= {};



DoSQL 				(DB_ID, "SELECT Branch,Site,NS,S FROM 'SLAC_MUTATION'", "return _substitutionReporter(0)");

nvar 			  = Abs(_siteMap);
nobs			  = Abs(_branchMap);
total			  = Abs(_substitutionReport);

_siteIndexer	  = Rows (_siteMap);

_aaDiversity		= {1,Columns ( _siteIndexer )};
for ( k = 0; k < Columns ( _siteIndexer ); k = k + 1 ) {
	siteToDo = 0+ _siteIndexer[k]-1;
	siteString = "" + siteToDo*3 + "-" + ( (siteToDo*3) + 2 ) + "";
	DataSetFilter siteFilter = CreateFilter (ds_0,3,siteString,"",""); /*no genetic code excl since i want ze stop codons in the profile */
	aaSite = {21,1}["0"];
	
	GetDataInfo (chars, siteFilter, "CHARACTERS");
	senseChars = Columns(chars);
	codonSiteProfile = {senseChars,1}["0"];
	
	for (i = 0; i < siteFilter.species; i = i + 1)
	{
		GetDataInfo (res, siteFilter, i, 0);
		howManyChars = (Transpose(res["1"]) * res)[0];
	
		if (howManyChars > 0 && howManyChars < senseChars)
		{
			codonSiteProfile = codonSiteProfile + res;
		}
	}
	
	for ( i = 0; i < 64; i = i + 1 ) {
		if ( codonSiteProfile [ i ] > 0 ) {
			aaSite [ _Genetic_Code [ i ] ] = aaSite [ _Genetic_Code [ i ] ] + codonSiteProfile [ i ];
		}	
	}
	aacount = 0;
	for ( i = 0; i < 21; i = i + 1 ) {
		if ( aaSite [ i ] > 0 ) {
			aacount = aacount + 1;
		}
	}
	_aaDiversity [ k ] = aacount;
}


if (nobs < 10)
{
	ErrorOut ("There should be at least 10 branches in the tree for the Toggle analysis.");
	return	  0;
}

fprintf (finalPHP,CLEAR_FILE,KEEP_OPEN,phpHead,"<H1 CLASS='SuccessCap'>Toggling analysis setup</H1>");

jobFileName = BASE_CGI_URL_STRING + "slacreport.pl?file=" + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "&amp;format="; /*access all the analysis associated with the job*/

fprintf                   (finalPHP, jobIDDIV); /* jobIDDIV is set in the _MFReader_.ibf */

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

dataAdjective = returnDataAdjective (_in_GeneticCodeTable,1); /* not necessary since always codon, but left in for brevity */


fprintf		  (finalPHP, "<DIV class = 'RepClassSM'>Mapped <b>", total, "</b> ",dataAdjective," substitutions over <b>", 
							nvar, "</b> sites to <b>", nobs, "</b> branches in the tree using the <i>",_in_ModelDescription,"</i> model <a href='",jobFileName,"3'>[details]</a><p>",
							"To begin a toggling analysis please select those sites that you wish to consider, keeping in mind that the complexity of the analysis grows non-linearly in the number of sites. We have filtered out all sites where no ",dataAdjective," substitutions were inferred. Furthemore, please note that there is an upper limit of ", maxToggleSites, " sites that can be tested for toggling.</DIV>"
);

fprintf (finalPHP, " <?php include('", BASEL_URL_STRING, "/js/toggle_togglers'); ?><script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script><script type='text/javascript'>totalAvailableSites=",nvar,";</script>");

fprintf (finalPHP, "<FORM name = 'optionsForm' method = 'POST' action = '", BASE_CGI_URL_STRING,"Toggle_step2.pl'>\n");

/* set cutoff criteria/value to select sites */
fprintf (finalPHP, "<DIV class = 'RepClassSM' id = 'bgmCutoffDIV'>Filter sites using either one or two filters. For one filter simply make first and second site filters identical.\n<TABLE WIDTH = '95%' CELLSPACING = '10px'><TR CLASS='ModelClass1' style = 'text-align:left'>",
				   "<TD>First site filter</TD><TD><SELECT NAME = 'cutoff1'>",
				   "\n<OPTION VALUE = '0' SELECTED>Count of branches with ",dataAdjective," subs\n",
				   "<OPTION VALUE = '1'>Proportion of branches with ",dataAdjective," subs\n",
				   "<OPTION VALUE = '2'>Entropy\n",
				   "<OPTION VALUE = '3'>Residue Diversity</SELECT></TD></TR>\n");
	
fprintf (finalPHP, "<TR CLASS='ModelClass2' style = 'text-align:left'><TD><span style = 'min-width:200px'>First threshold</span></TD><TD><INPUT TYPE = 'text' NAME = 'CutoffValue1' VALUE = '3' MAXLENGTH = '15' SIZE = '10'>");
fprintf (finalPHP, "<a href='http://www.datamonkey.org/help/toggle.php#options' target = '_blank' class = 'INFO' onmouseover=\"Tip('Select all sites with attribute greater (less for residue diversity) <br>than or equal to this value')\">Help</a></TD></TR>\n");

fprintf (finalPHP, "<TR CLASS='ModelClass1' style = 'text-align:left'><TD>Second site filter</TD><TD><SELECT NAME = 'cutoff2'>",
					"\n<OPTION VALUE = '0' SELECTED>Count of branches with ",dataAdjective," subs\n",
					"<OPTION VALUE = '1'>Proportion of branches with ",dataAdjective," subs\n",
				   "<OPTION VALUE = '2'>Entropy\n",
				   "<OPTION VALUE = '3'>Residue Diversity</SELECT></TD></TR>\n");
					
fprintf (finalPHP, "<TR CLASS='ModelClass2' style = 'text-align:left'><TD><span style = 'min-width:200px'>Second threshold</span></TD><TD><INPUT TYPE = 'text' NAME = 'CutoffValue2' VALUE = '3' MAXLENGTH = '15' SIZE = '10'>");
fprintf (finalPHP, "<a href='http://www.datamonkey.org/help/toggle.php#options' target = '_blank' class = 'INFO' onmouseover=\"Tip('Select all sites with attribute greater (less for residue diversity) <br>than or equal to this value')\">Help</a></TD></TR>\n");

fprintf (finalPHP, "<TR CLASS='ModelClass1' style = 'text-align:left;'>",
					"<TD COLSPAN = '2'><INPUT TYPE=BUTTON VALUE = 'Filter sites' onClick = 'filterSites()'><INPUT TYPE=BUTTON VALUE = 'Select All' onClick = 'toggleChecks(1)'><INPUT TYPE=BUTTON VALUE = 'Select None' onClick = 'toggleChecks(0)'></TD></TR></TABLE></DIV>\n");

fprintf (finalPHP, "<H1 class = 'ErrorCap' id = 'SelectionSummary'><span id = 'SelectionSummaryText'>Selected 0/0 sites</span></H1>");


fprintf (finalPHP, "<DIV class = 'RepClassSM'><TABLE BORDER = '0'><TR CLASS = 'TRReport' style = 'font-size:small'>");
fprintf (finalPHP, "<th>Codon</th><th>Count of branches with non-syn substitutions (BNSS)</th><th>Proportions of BNSS</th><th>Entropy</th><th>Residue Diversity</th><th>Selected</th><th>Map</th></TR>\n");

javascriptTest = "";
javascriptTest * 8192;



for (i = 0; i < nvar; i = i+1)
{
	if (colsums[i] > 0)
	{
		si = (-1)+_siteIndexer[i];
		fprintf (finalPHP, "<tr CLASS='TRReport", i%2+1, "' style = 'font-size:x-small'>\n");
		fprintf (finalPHP, "<td>", _siteIndexer[i], "</td><td>", colsums[i], "</td><td>", subs_freq[i], "</td><td>", entropy[i], "</td><td>", _aaDiversity[i], 
							"</td><td><input TYPE='checkbox' ID = 'site_",i,"' NAME='chkbx",i,"' onClick = 'countSelected()' VALUE = '",si+1,"'></td>\n");
		
		javascriptTest * ("attributeArray[" + (i*4  ) + "] = " + colsums  [i]   + ";" +
						  "attributeArray[" + (i*4+1) + "] = " + subs_freq[i] + ";" +
						  "attributeArray[" + (i*4+2) + "] = " + entropy  [i] + ";" +
						  "attributeArray[" + (i*4+3) + "] = " + _aaDiversity [i] + ";" +
						  "\n");
		

		fprintf (finalPHP, "<TD style = 'font-size: 10px;'><a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=0'>[Codons]</a>",
							 "<a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=1'>[AA]</a>",
							 "<a href='",BASE_CGI_URL_STRING,"siteMap.pl?file=",filePrefix,"&site=",si,"&mode=2'>[Counts]</a>",
							 "</TD></TR>\n");		
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
				   "<INPUT TYPE = 'hidden' NAME = 'treeMode' VALUE ='", _treeMode, "'>",
				   "</DIV></FORM>\n");

fprintf		  (finalPHP, phpFoot, CLOSE_FILE);

if (mapMutations)
{
	SLAC_ModelTable 			= {};
	SLAC_ModelTable 			["Model"] = "STRING";
	SLAC_ModelTable 			["TreeMode"] = "STRING";
	_CheckDBID 					(slacDBID,"TOGGLE_MODEL",SLAC_ModelTable);
	record 						= {};
	record 						["Model"] = _in_ModelDescription;
	record 						["TreeMode"] = _treeMode;

	_InsertRecord 				(slacDBID,"TOGGLE_MODEL", record);
	outFile = BASE_CLUSTER_ACCESS_PATH + (splitFilePath(_in_FilePath))["FILENAME"] + ".1.togglefit";
	LIKELIHOOD_FUNCTION_OUTPUT = 7;
	if (_in_GeneticCodeTable >= 0)
	{
		fprintf (outFile,CLEAR_FILE, lf);
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
	fprintf (finalPHP,CLEAR_FILE,phpHead, "<H1 class = 'ErrorCap'>TOGGLE error</H1><DIV class = 'ErrorTagSM'>\n", errString, "\n</DIV>",phpFoot);
	return 0;
}
