selLabelMatrix = {{"Codon","SLAC dN-dS","SLAC p-value","FEL dN-dS","FEL p-value","REL dN-dS","REL Bayes Factor","MEME &omega;<sup>+</sup>", "MEME p-value","FUBAR dN-dS","FUBAR Post. Pr."}};
symbols		   = {{"-","+"}};

/*___________________________________________________________________________________________________________*/

function	PrintASCIITable (dataMatrix, keyMatrix, titleMatrix,haveAnalysis)
{
	outString="";
	outString*8192;
	
	chars = {analysisCount, 1};
	
	if (Abs(dataMatrix))
	{
		outString*"<DIV CLASS='RepClassSM'>\n<TABLE BORDER = '0'><TR CLASS='TRReport' style = 'font-size:11px;'>";
		nc = Columns(titleMatrix);
		
		for (counter1=0; counter1<nc; counter1 += 1 )
		{
			analysisCode = (counter1-1)$2;
			if (counter1 > 0)
			{
				analysisCode = analyses[analysisCode];
				if (haveAnalysis[analysisCode] == 0)
				{
					counter1 += 1;
					continue;
				}
			}
			outString*"<td>";
			outString*titleMatrix[counter1];
			outString*"</td>\n";
		}
		
		outString*"<td>Consensus</td>";
		if (haveAnalysis["SLAC"])
		{
			outString*"<td>Additional Information</td>";
		}
		outString*"</tr>\n";
		
		
		for (counter1=0; counter1<Abs(dataMatrix); counter1 = counter1 + 1)
		{
			rowData = dataMatrix[keyMatrix[counter1]];
			
			if (counter1%2)
			{
				outString*"\n<tr CLASS='TRReport2' style = 'font-size:x-small'>";
			}
			else
			{
				outString*"\n<tr CLASS='TRReport1' style = 'font-size:x-small'>";
			}
			
			codonIndex = keyMatrix[counter1]-1;
			outString*"\n<td>";
			outString*Format(codonIndex+1,-1,-1);
			outString*"\n</td>\n";
			
			for (k = 0; k < analysisCount; k+=1)
			{
				chars[k] = "&nbsp;";
			}

			for (counter2 = 0; counter2 < nc-1; counter2 += 1)
			{
				doneTD = 0;
				
				if (haveAnalysis[analyses[counter2$2]] == 0)
				{
					counter2 += 1;
					continue;
				}
				
				content = Format(rowData[counter2],8,3);
				if (counter2 == 1 && rowData[0] != 0 && rowData[1] <= slacP)
				{
					chars[0] = symbols[rowData[0]>0];
					outString*"\n<td style = 'color:white;background-color:#57197F'>";
					doneTD = 1;
				}
				if (counter2 == 3 && rowData[2] != 0 && rowData[3] <= felP)
				{
					chars[1] = symbols[rowData[2]>0];
					outString*"\n<td style = 'color:white;background-color:#57197F'>";
					doneTD = 1;
				}
				if (counter2 == 5 && rowData[5] >= relBF)
				{
					chars[2] = symbols[rowData[4]>0];
					outString*"\n<td style = 'color:white;background-color:#57197F'>";
					doneTD = 1;
				}
				if (counter2 == 7 && rowData[7] <= memeP && rowData[6] > 1)
				{
					chars[3] = symbols[1];
					outString*"\n<td style = 'color:white;background-color:#57197F'>";
					doneTD = 1;
				}
				if (counter2 == 6 && rowData[6] > 100){
					content = "&gt;100";
				}
				if (counter2 == 9 && (rowData[9] >= fubarP || (1-rowData[9] >= fubarP))){
					chars[4] = symbols[rowData[8]>0];
					outString*"\n<td style = 'color:white;background-color:#57197F'>";
					doneTD = 1;
				}

				if (! doneTD)
				{
					outString*"\n<td>";
				}
				
				outString*content;
				outString*"\n</td>\n";
			}
			
			outString*("<TD><TABLE BORDER = 0 PADDING = '1px'><TR style = 'font-size:12px;'>");
			if (haveAnalysis["SLAC"])
			{
				outString*("<TD style = 'text-align:center;border: solid black 1px;color:" + colors[1][rowData[0]>0] +";background-color:" + colors[0][rowData[0]>0] + "'>"+chars[0]+"</TD>");
			}
			if (haveAnalysis["FEL"])
			{
				outString*("<TD style = 'text-align:center;border: solid black 1px;color:" + colors[1][rowData[2]>0] +";background-color:" + colors[0][rowData[2]>0] + "'>"+chars[1]+"</TD>");
			}
			if (haveAnalysis["REL"])
			{
				outString*("<TD style = 'text-align:center;border: solid black 1px;color:" + colors[1][rowData[4]>0] +";background-color:" + colors[0][rowData[4]>0] + "'>"+chars[2]+"</TD>")
			}						
			if (haveAnalysis["MEME"])
			{
				outString*("<TD style = 'text-align:center;border: solid black 1px;color:" + colors[1][rowData[6]>1] +";background-color:" + colors[0][rowData[6]>1] + "'>"+chars[3]+"</TD>")
			}						
			if (haveAnalysis["FUBAR"])
			{
				outString*("<TD style = 'text-align:center;border: solid black 1px;color:" + colors[1][rowData[8]>0] +";background-color:" + colors[0][rowData[8]>0] + "'>"+chars[4]+"</TD>")
			}						
			outString*("</TR></TABLE></TD>");
			if (haveAnalysis["SLAC"])
			{
				outString*("<TD style = 'font-size: 10px;'><a href='"+BASE_CGI_URL_STRING+"siteMap.pl?file="+filePrefix+"&site="+codonIndex+"&mode=0'>[Codons]</a>"+
						   "<a href='"+BASE_CGI_URL_STRING+"siteMap.pl?file="+filePrefix+"&site="+codonIndex+"&mode=1'>[AA]</a>"+
								 "<a href='"+BASE_CGI_URL_STRING+"siteMap.pl?file="+filePrefix+"&site="+codonIndex+"&mode=2'>[Counts]</a>"+
								 "</TD></TR>\n");
			}
		}
		outString*"</TABLE></DIV>\n";	
	}
	outString*0;
	return outString;
}

/* ________________________________________________________________________________________________*/

fscanf		(stdin, "String", filePrefix);
fscanf		(stdin, "Number", slacP);
fscanf		(stdin, "Number", felP);
fscanf		(stdin, "Number", relBF);
fscanf		(stdin, "Number", memeP);
fscanf		(stdin, "Number", fubarP);

ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");

/* ________________________________________________________________________________________________*/

function ErrorOut (errString)
{
	fprintf (stdout, "ERROR:<DIV class = 'ErrorTagSM'>\n", errString, "\n</DIV>");
	return 0;
}

/* ________________________________________________________________________________________________*/

ExecuteAFile	("../Shared/DBTools.ibf");
slacDBID 		 = _openCacheDB      (filePrefix);

analyses 		= {{"SLAC","FEL","REL","MEME","FUBAR"}};
analysisCount	= Columns (analyses);
pvalues			= {analysisCount,1};

haveAnalysis = {};

for (k = 0; k < analysisCount; k+=1)
{
	haveAnalysis[analyses[k]] =  _TableExists (slacDBID, analyses[k] + "_SUMMARY");
}

if (haveAnalysis ["SLAC"])
{
	slacDef = 0+(_ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SLAC_SUMMARY WHERE COL_KEY == 'PValue'"))[0];
	if (slacP < 0 || slacP > 1)
	{
		slacP = slacDef;
	}
}
pvalues[0] = slacP;

if (haveAnalysis ["FEL"])
{
	felDef  = 0+(_ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FEL_SUMMARY WHERE COL_KEY == 'PValue'"))[0];
	if (felP < 0 || felP > 1)
	{
		felP = felDef;
	}
}
pvalues[1] = felP;

if (haveAnalysis ["REL"])
{
	relDef  = 0+(_ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM REL_SUMMARY WHERE COL_KEY == 'BF'"))[0];
	if (relBF < 1)
	{
		relBF = relDef;
	}
}
pvalues[2] = relBF;

if (haveAnalysis ["MEME"])
{
	memeDef = 0+(_ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM MEME_SUMMARY WHERE COL_KEY == 'PValue'"))[0];
	if (memeP < 0 || memeP > 1)
	{
		memeP = memeDef;
	}
}
pvalues[3] = memeP;

if (haveAnalysis ["FUBAR"])
{
	fubarDef = 0+(_ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FUBAR_SUMMARY WHERE COL_KEY == 'PosteriorProbability'"))[0];
	if (fubarP < 0 || fubarP > 1)
	{
		fubarP = fubarDef;
	}
}
pvalues[4] = fubarP;

sqlPS = {}; sqlNS = {};

sqlPS ["SLAC"] = "SELECT FIELD_0+1 AS CODON FROM SLAC_RESULTS WHERE FIELD_9>0 AND FIELD_10<="+pvalues[0];
sqlNS ["SLAC"] = "SELECT FIELD_0+1 AS CODON FROM SLAC_RESULTS WHERE FIELD_9<0 AND FIELD_11<="+pvalues[0];

sqlPS ["FEL"] = "SELECT Codon from FEL_RESULTS WHERE (dS<dN AND p<="+pvalues[1]+")";
sqlNS ["FEL"] = "SELECT Codon from FEL_RESULTS WHERE (dS>dN AND p<="+pvalues[1]+")";

sqlPS ["REL"] = "SELECT Codon FROM REL_RESULTS WHERE (PosBF>="+pvalues[2]+")";
sqlNS ["REL"] = "SELECT Codon FROM REL_RESULTS WHERE (NegBF>="+pvalues[2]+")";

sqlPS ["MEME"] = "SELECT Codon FROM MEME_RESULTS WHERE (PValue <= " + pvalues[3] + " AND beta2 > alpha)";
sqlNS ["MEME"] = "";

sqlPS ["FUBAR"] = "SELECT Codon FROM FUBAR_RESULTS WHERE (possel>="+pvalues[4]+")";
sqlNS ["FUBAR"] = "SELECT Codon FROM FUBAR_RESULTS WHERE (negsel>="+pvalues[4]+")";


fprintf (stdout, "<H1 class = 'SuccessCap'>Selected sites using method consensus</H1>", _makeJobIDHTML (filePrefix));

fprintf (stdout, "<DIV CLASS='RepClassSM'><form action='",BASE_CGI_URL_STRING,"integrative.pl' method = 'GET'><b>Significance levels</b>",
					   "<input type = 'hidden' name = 'file' value = '",filePrefix,"'><TABLE WIDTH = '75%'>");
		
displayCount = 1;	
titles = {{"SLAC p-value","FEL p-value", "REL Bayes Factor", "MEME p-value","FUBAR Posterior Probability"}};
cgikeys = {{"slac","fel","rel","meme","fubar"}};

sqlPSStatement = "CREATE TEMP TABLE PSEL AS ";
sqlNSStatement = "CREATE TEMP TABLE NSEL AS ";

for (k = 0; k < analysisCount; k+=1)
{
	if (haveAnalysis[analyses[k]])
	{
		fprintf (stdout, "<TR CLASS = 'TRReport" + (2-(displayCount%2)) + "' style = 'text-align:left; font-size:12px;'><TD>"+titles[k]+"</TD><TD><input type = 'text' name = '" + cgikeys[k] + "' value = '",pvalues[k],"' size = '5'></TD></TR>\n");
		
		if (Abs(sqlPS[analyses[k]]))
		{
			if (displayCount > 1)
			{
				sqlPSStatement += " UNION ";
			}
			sqlPSStatement += " " + sqlPS[analyses[k]] + " ";
		}
		if (Abs(sqlNS[analyses[k]]))
		{
			if (displayCount > 1)
			{
				sqlNSStatement += " UNION ";
			}
			sqlNSStatement += " " + sqlNS[analyses[k]] + " ";
		}
		
		displayCount += 1;
	}
}					   					   



fprintf (stdout, "<TR CLASS = 'TRReport' style = 'text-align:right; font-size:12px;'><TD colspan = 2><input type = 'submit' value = 'Retabulate'></TD></TR></TABLE>\n</form></DIV>");

allPS   = _ExecuteSQL  (slacDBID, sqlPSStatement + " ORDER BY CODON");
allNS   = _ExecuteSQL  (slacDBID, sqlNSStatement + " ORDER BY CODON");

psSELMerge = {};
nsSELMerge = {};

if (haveAnalysis["SLAC"])
{
	ps_slac = _ExecuteSQL  (slacDBID,"SELECT FIELD_0+1 AS Codon,FIELD_12 AS DNDS,FIELD_10 AS p FROM SLAC_RESULTS WHERE Codon IN (SELECT * FROM PSEL)");
	ns_slac = _ExecuteSQL  (slacDBID,"SELECT FIELD_0+1 AS Codon,FIELD_12 AS DNDS,FIELD_11 AS p FROM SLAC_RESULTS WHERE Codon IN (SELECT * FROM NSEL)");
	doMerge ("psSELMerge","ps_slac",0);
	doMerge ("nsSELMerge","ns_slac",0);
}

if (haveAnalysis["FEL"])
{
	ps_fel  = _ExecuteSQL  (slacDBID,"SELECT Codon,ScaledDNDS AS DNDS,p FROM FEL_RESULTS WHERE Codon IN (SELECT * FROM PSEL)");
	ns_fel  = _ExecuteSQL  (slacDBID,"SELECT Codon,ScaledDNDS AS DNDS,p FROM FEL_RESULTS WHERE Codon IN (SELECT * FROM NSEL)");
	doMerge ("psSELMerge","ps_fel" ,1);
	doMerge ("nsSELMerge","ns_fel" ,1);
}

if (haveAnalysis["REL"])
{
	ps_rel  = _ExecuteSQL  (slacDBID,"SELECT Codon,dSdN AS DNDS,PosBF AS p FROM REL_RESULTS WHERE Codon IN (SELECT * FROM PSEL)");
	ns_rel  = _ExecuteSQL  (slacDBID,"SELECT Codon,dSdN AS DNDS,NegBF AS p FROM REL_RESULTS WHERE Codon IN (SELECT * FROM NSEL)");
	doMerge ("psSELMerge","ps_rel" ,2);
	doMerge ("nsSELMerge","ns_rel" ,2);
}

if (haveAnalysis["MEME"])
{
	ps_meme  = _ExecuteSQL  (slacDBID,"SELECT Codon,beta2/MAX(alpha,0.0001) AS DNDS,pvalue AS p FROM MEME_RESULTS WHERE Codon IN (SELECT * FROM PSEL)");
	doMerge ("psSELMerge","ps_meme" ,3);
}

if (haveAnalysis["FUBAR"])
{
	ps_rel  = _ExecuteSQL  (slacDBID,"SELECT Codon,dnmds AS DNDS,possel AS p FROM FUBAR_RESULTS WHERE Codon IN (SELECT * FROM PSEL)");
	ns_rel  = _ExecuteSQL  (slacDBID,"SELECT Codon,dnmds AS DNDS,negsel AS p FROM FUBAR_RESULTS WHERE Codon IN (SELECT * FROM NSEL)");
	doMerge ("psSELMerge","ps_rel" ,4);
	doMerge ("nsSELMerge","ns_rel" ,4);
}

_closeCacheDB (slacDBID);

posSelected = Abs(psSELMerge);
negSelected = Abs(nsSELMerge);

psKeys = Rows (psSELMerge);
dim    = Abs(psSELMerge);
sorted = {dim,1};
for (k=0; k<dim; k=k+1)
{
	sorted[k] = 0+psKeys[k];
}
sorted = sorted % 0;


fprintf (stdout, "<DIV CLASS='RepClassSM'><b>Color Legend</b>: <dl>",
				 "<dt><span style = 'color:white;background-color:#57197F'>Codon is non-neutral</span> according to a given method at the specified significance level",
				 "<dt>In the consensus column, <span style = 'color:black;background-color:",colors[1],";border: solid black 1px;'>Codon has dN&gt;dS</span>. '+' inside the box means that the difference is significant",				 
				 "<dt>In the consensus column, <span style = 'color:white;background-color:",colors[0],";border: solid black 1px;'>Codon has dN&lt;dS</span>. '+' inside the box means that the difference is significant",				 
				 "</dl></DIV>");

fprintf (stdout, "<DIV CLASS='RepClassSM'>Found <b>",posSelected,
				   "</b> positively selected sites (at least one method) <p>",PrintASCIITable  (psSELMerge, sorted, selLabelMatrix,haveAnalysis),"</form></DIV>");


psKeys = Rows (nsSELMerge);
dim = Abs(nsSELMerge);
sorted = {dim,1};
for (k=0; k<dim; k=k+1)
{
	sorted[k] = 0+psKeys[k];
}
sorted = sorted % 0;

haveAnalysis["MEME"] = 0;

fprintf (stdout, "<DIV CLASS='RepClassSM'>Found <b>",negSelected,
				   "</b> negatively selected sites (at least one method) <p>",PrintASCIITable  (nsSELMerge, sorted, selLabelMatrix,haveAnalysis),"</form></DIV>");



function doMerge (avlID&,inData&,idx)
{
	upTo = Abs(inData);
	for (_i = 0; _i < upTo; _i = _i + 1)
	{
		codonID = 0+(inData[_i])["Codon"];
		alreadyDefined = Rows(avlID[codonID]);
		if (alreadyDefined == 0)
		{
			avlID[codonID] = {1,analysisCount*2};
		}
		
	 	(avlID[codonID])[idx*2]   = 0+(inData[_i])["DNDS"];
	 	(avlID[codonID])[idx*2+1] = 0+(inData[_i])["p"];		
	}
	return 0;
}
