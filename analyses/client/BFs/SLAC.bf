RequireVersion  ("0.9920060815");

fscanf	(stdin, "Number", _in_GeneticCodeTable);

if (_in_GeneticCodeTable < 0)
{
	return 0;
}

fscanf	(stdin, "String", _in_ModelDescription);
fscanf	(stdin, "String", _in_FilePath);
fscanf	(stdin, "Number", _in_dNdSOptions);
fscanf	(stdin, "Number", _in_dNdSValue);
fscanf	(stdin, "Number", _in_dNdSAmbigs);
fscanf	(stdin, "Number", _in_dNdSPValue);
fscanf	(stdin, "Number", _treeMode);

timer = Time(0);

skipCodeSelectionStep = 1;
ExecuteAFile("../Shared/chooseGeneticCode.def");
ExecuteAFile("../Shared/DBTools.ibf");
ExecuteAFile("../Shared/Outputs.bf");
ApplyGeneticCodeTable (_in_GeneticCodeTable);

ExecuteAFile 	("qndhelper1_mf.ibf");

intermediateHTML = BASE_OUTPUT_PATH + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "_slac.txt";
finalPHP         = BASE_OUTPUT_PATH + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "_slac.php";

fprintf		(intermediateHTML, CLEAR_FILE);

rOptions    = _in_dNdSOptions;
global dNdS = 1;

if (rOptions == 1)
{
	dNdS = _in_dNdSValue;
}



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

fprintf 			(intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 3</b> Reconstructing ancestors and detecting selection.");

slacDBID = _openCacheDB      (filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"]);

SLAC_ResultTable = {};

for (k=0; k<13; k=k+1)
{
	SLAC_ResultTable["FIELD_"+k] = "REAL";
}

_CheckDBID (slacDBID,"SLAC_RESULTS",SLAC_ResultTable);

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

/* generate result output */

fscanf	("../Formats/phphead","Raw",phpHead);
phpHead = phpHead ^ {{"_REPLACE_DOCUMENT_TITLE","\"SLAC results\""}};

fscanf				("../Formats/phpfoot","Raw",phpFoot);


SLAC_SummaryTable = {};
SLAC_SummaryTable ["COL_KEY"] 	 = "STRING";
SLAC_SummaryTable ["COL_VALUE"]  = "STRING";

_CheckDBID 		  (slacDBID,"SLAC_SUMMARY",SLAC_SummaryTable);

record = {};
record ["COL_KEY"] = "Model";record ["COL_VALUE"] = _in_ModelDescription;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "genCodeID";record ["COL_VALUE"] = _in_GeneticCodeTable;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "dNdSOptions";record ["COL_VALUE"] = _in_dNdSOptions;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "AmbigOptions";record ["COL_VALUE"] = _in_dNdSAmbigs;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "PValue";record ["COL_VALUE"] = _in_dNdSPValue;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "TreeMode";record ["COL_VALUE"] = _treeMode;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);


SLAC_TreeTable = {};
SLAC_TreeTable ["Partition"] = "INTEGER";
SLAC_TreeTable ["Tree"] = "STRING";

_CheckDBID (slacDBID,"SLAC_TREES",SLAC_TreeTable);

fprintf (finalPHP,CLEAR_FILE,KEEP_OPEN,phpHead,"<H1 CLASS='SuccessCap'>SLAC Analysis Results</H1>");

jobFileName = BASE_CGI_URL_STRING + "slacreport.pl?file=" + filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"] + "&amp;format=";

fprintf (finalPHP, "<DIV CLASS='RepClassCT'><b>Reports</b> <a href='",jobFileName,"0'>[HTML]</a> <a href='",
			        jobFileName,"1' target = '_blank'>[CSV]</a> <a href='",jobFileName,"2",
			        "'>[Plots]</a> <a href='",jobFileName,"3'>[Inferred Substitutions]</a></DIV>");


fprintf (finalPHP, jobIDDIV, _makeDataDescriptionTM (slacDBID,_treeMode, treeLengthArray));

record = {};

for (k = 1; k<=fileCount; k=k+1)	
{	
	ExecuteCommands ("_treeString=Format(codonTree_"+k+",1,1);");
	record ["Partition"] = k;record ["Tree"] = _treeString;_InsertRecord (slacDBID,"SLAC_TREES", record);
}

record = {};

fprintf (finalPHP, "<DIV CLASS='RepClassSM'><b>Nucleotide Model(",modelDesc,") Fit Results</b><p><u>Log(L)</u> = ",Format(nuc_res[1][0],0,3),"<p><u>Relative substitution rates</u><p>",
		"<TABLE style = 'margin-left:10px'><TR CLASS = 'TRReportT'><TH>&nbsp;</TH><TH>A</TH><TH>C</TH><TH>G</TH><TH>T</TH></TR>",
		"<TR CLASS = 'TRReport1'><TH>A</TH><TD>&#42;</TD><TD>",AC,"</TD><TD>1</TD><TD>",AT,"</TD></TR>",		
		"<TR CLASS = 'TRReport2'><TH>C</TH><TD>&#45;</TD><TD>&#42</TD><TD>",CG,"</TD><TD>",CT,"</TD></TR>",		
		"<TR CLASS = 'TRReport1'><TH>G</TH><TD>&#45;</TD><TD>&#45</TD><TD>&#42</TD><TD>",GT,"</TD></TR>",		
		"<TR CLASS = 'TRReport2'><TH>T</TH><TD>&#45;</TD><TD>&#45</TD><TD>&#45</TD><TD>&#42</TD></TR></TABLE>",		
		"</DIV><DIV CLASS='RepClassSM'><b>Codon Model Fit Results</b> (processor time taken: ", Time(0)-timer, " seconds)<p><u>Log(L)</u> = ",codon_LL," &nbsp;");
		

record ["COL_KEY"] = "nucLL";record ["COL_VALUE"] = nuc_res[1][0];_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "codonLL";record ["COL_VALUE"] = codon_LL;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "dNdS";record ["COL_VALUE"] = dNdS;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);

if (rOptions!=3)
{
	fprintf (finalPHP, "<u>mean dN/dS</u> = ",dNdS);
}
else
{
	fprintf (finalPHP, "<u>mean dN/dS</u> = ",dNdS," (95% CI = [", dNdS_CovarianceMatrix[0][0], "," , dNdS_CovarianceMatrix[0][2], "])");
	record ["COL_KEY"] = "dNdS_CI";record ["COL_VALUE"] = ""+dNdS_CovarianceMatrix[0][0] + "," + dNdS_CovarianceMatrix[0][2];_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
}



fprintf (finalPHP, "</DIV>");

filePrefix=filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"];

if (posSelected)
{
	psMatrix = {posSelected, 4};
	h = 0;
	for (p2=0; p2<p; p2=p2+1)
	{
		v = resultMatrix [p2][8];
		if (v>0)
		{
			if ((resultMatrix [p2][9] < sigLevel)&& (resultMatrix[p2][0]+resultMatrix[p2][1] >= 1.0))
			{
				psMatrix[h][0] = p2+1;
				psMatrix[h][1] = v;
				psMatrix[h][2] = resultMatrix [p2][11];
				psMatrix[h][3] = resultMatrix [p2][9];
				h = h+1;
			}
		}
	}
	
	fprintf (finalPHP, "<DIV CLASS='RepClassSM'><form action='",BASE_CGI_URL_STRING,"slacpvalue.pl' method = 'GET'>Found <b>",posSelected,
					   "</b> positively selected sites (<input type = 'hidden' name = 'file' value = '",
					   filePrefix,"'><input type = 'text' name = 'pvalue' value = '",
					   sigLevel,
					   "' size = '5'> significance level <input type = 'submit' value = 'Retabulate'>)<p>",PrintASCIITable  (psMatrix, selLabelMatrix),"</form></DIV>");
}
else
{
	fprintf (finalPHP, "<DIV CLASS='RepClassSM'><form action='",BASE_CGI_URL_STRING,"slacpvalue.pl' method = 'GET'>Found no positively selected sites (<input type = 'hidden' name = 'file' value = '",
					   filePrefix,"'><input type = 'text' name = 'pvalue' value = '",
					   sigLevel,
					   "' size = '5'> significance level <input type = 'submit' value = 'Retabulate'>)</form></DIV>");
}



if (negSelected)
{
	psMatrix = {negSelected, 4};
	h = 0;
	for (p2=0; p2<p; p2=p2+1)
	{
		v = resultMatrix [p2][8];
		if (v<0)
		{
			if ((resultMatrix [p2][10] < sigLevel)&& (resultMatrix[p2][0]+resultMatrix[p2][1] >= 1.0))
			{
				psMatrix[h][0] = p2+1;
				psMatrix[h][1] = v;
				psMatrix[h][2] = resultMatrix [p2][11];
				psMatrix[h][3] = resultMatrix [p2][10];
				h = h+1;
			}
		}
	}
	
	fprintf (finalPHP, "<DIV CLASS='RepClassSM'>Found <b>",negSelected,"</b> negatively selected sites (",sigLevel," significance level)<p>",PrintASCIITable  (psMatrix, selLabelMatrix),"</DIV>");
}
else
{
	fprintf (finalPHP, "<DIV CLASS='RepClassSM'>Found no negatively selected sites (",sigLevel," significance level)</DIV>");
}

record ={};
record ["COL_KEY"] = "PosSel";record ["COL_VALUE"] = posSelected;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);
record ["COL_KEY"] = "NegSel";record ["COL_VALUE"] = negSelected;_InsertRecord (slacDBID,"SLAC_SUMMARY", record);

fprintf (finalPHP, phpFoot, CLOSE_FILE);


_closeCacheDB (slacDBID);

GetString (timeStamp, TIME_STAMP, 1);
_logFile = BASE_LOG_FILES_PATH + "SLAC_usage.log";
fprintf (_logFile,timeStamp[0][Abs(timeStamp)-2],",",ds_0.species,",",ds_0.sites/3,",",Time(0)-timer,",",modelDesc,",",posSelected,",",negSelected,",",sigLevel,"\n");

