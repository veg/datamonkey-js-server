ExecuteAFile("../Shared/HyPhyGlobals.ibf");
ExecuteAFile("../Shared/GrabBag.bf");


fscanf		(stdin,"String", filePrefix);
fscanf		(stdin,"Number", optionOutput);

if (optionOutput >= 4)
{
	fscanf		(stdin,"String", gnuplotFormat);
	fscanf		(stdin,"String", style);
	fscanf		(stdin,"String", xaxis);
	fscanf		(stdin,"String", yaxis);
	fscanf		(stdin,"String", size);
}

 
/* ________________________________________________________________________________________________*/

function ErrorOut (errString)
{
	fprintf (stdout, "ERROR:<DIV class = 'ErrorTagSM'>\n", errString, "\n</DIV>");
	return 0;
}

/* ________________________________________________________________________________________________*/

if (optionOutput!=2)
{
	ExecuteAFile	("../Shared/DBTools.ibf");
	slacDBID 		 = _openCacheDB      (filePrefix);
	pv = 0+_ExecuteSQLSingle  (slacDBID,"SELECT COL_VALUE FROM FUBAR_SUMMARY WHERE COL_KEY = 'PosteriorProbability'");
	ExecuteAFile 			("../Shared/OutputsFUBAR.bf");
	tableKeys = Rows		(FUBAR_ResultTable);
}

if (optionOutput < 2)
{
	fubarInfo 		= _ExecuteSQL  (slacDBID,"SELECT * FROM FUBAR_RESULTS ORDER BY CODON");
	titleMatrix 	= {1,10};
	

	rowCount  = Abs	   		(fubarInfo);
	colCount  = Abs	        (FUBAR_ResultTable);
	headers	  = Rows		(FUBAR_ResultTable);
	
	colMap	  = {{0,1,2,3,4,5,6,7,8,9}};

	if (optionOutput == 1) /* CSV */
	{
		titleMatrix[0]  = "Codon";
		titleMatrix[1]  = "alpha";
		titleMatrix[2]  = "beta";
		titleMatrix[3]  = "beta-alpha";
		titleMatrix[4]  = "Posterior Prob Positive Selection";
		titleMatrix[5]  = "Posterior Prob Negative Selection";
		titleMatrix[6]  = "Potential Scale Reduction Factor";
		titleMatrix[7]  = "Effective sample size";
		titleMatrix[8]  = "Estimated variance of the posterior prob of positive selection";
		titleMatrix[9]  = "Empirical Bayes Factor";

		fprintf (stdout, Join (",", titleMatrix), "\n");
		
		for (r=0; r<rowCount; r=r+1)
		{
			matrixInfo = {1,colCount};
			for (c = 0; c < colCount; c+=1)
			{
				matrixInfo[c] = (fubarInfo[r])[headers[colMap[c]]];
			}
			fprintf (stdout, Join (",", matrixInfo), "\n");
		}
	}
	else
	{
		titleMatrix[0]  = "Codon";
		titleMatrix[1]  = "&alpha;";
		titleMatrix[2]  = "&beta;";
		titleMatrix[3]  = "&beta;-&alpha;";
		titleMatrix[4]  = "Pr[&beta;&gt;&alpha;]";
		titleMatrix[5]  = "Pr[&beta;&lt;&alpha;]";
		titleMatrix[6]  = "PSRF";
		titleMatrix[7]  = "N<sub>eff</sub>";
		titleMatrix[8]  = "Var (Pr[&beta;&gt;&alpha;])";
		titleMatrix[9]  = "EBF[&beta;&gt;&alpha;]";


		fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script>\n<H1 CLASS = 'SuccessCap'>Detailed FUBAR results</H1>");
		fprintf (stdout, _makeJobIDHTML (filePrefix));
		fprintf (stdout, "<DIV CLASS = 'RepClassSM'>");
		
		fprintf (stdout, "<b>Inferred posterior expectations of substitution rates and probabilities of pervasive natural selection at each site.</b>",
		"<p/> <TABLE BORDER = '0' style = 'margin:10px'><TR class = 'TRReportT' style = 'font-size:14px';><TD>");
		fprintf (stdout, Join ("</TD><TD>", titleMatrix), "</TD><TD>3D rate plot</TR>\n");

		for (r=0; r<rowCount; r=r+1)
		{
			trClass = "TRReportNT";
			
			
			if (0 + (fubarInfo[r])["possel"] >= pv){
				trClass = "TRReportPS";			
			} else {
                if (0 + (fubarInfo[r])["negsel"] >= pv) {
                    trClass = "TRReportNS";	
                }		
			}
			
			matrixInfo = {1,colCount};
			matrixInfo[0] = (fubarInfo[r])[headers[colMap[0]]];
			for (c = 1; c < colCount; c+=1)
			{
				matrixInfo[c] = normalizeNumber((fubarInfo[r])[headers[colMap[c]]]);
			}

			fprintf (stdout, "<TR class = '",trClass,"' style = 'font-size:12px;'><TD>",Join ("</TD><TD>", matrixInfo),"</TD>",
			    ,("<TD><a href = '" + BASE_CGI_URL_STRING + "wrapHyPhyBF.pl?file=fubar_plotter&arguments="+filePrefix+"-"+(r+1)+"-svg&mode=4' target = '_blank'>[SVG]</a>"+
            "<a href = '" + BASE_CGI_URL_STRING + "wrapHyPhyBF.pl?file=fubar_plotter&arguments="+filePrefix+"-"+(r+1)+"-png&mode=5' target = '_blank'>[PNG]</a></TD>"),"</TR>\n");
		}
		
		fprintf (stdout, "</TABLE>");
		
		
		fscanf ("../Formats/fubar_report","Raw",meme_Legend);
		fprintf (stdout, meme_Legend);
		fprintf (stdout, "</DIV>");
	}
}
else
{
	if (optionOutput == 2)
	{
		fprintf (stdout, "<H1 CLASS = 'SuccessCap'>Generate selection plots from FUBAR results</H1>");
		fprintf (stdout, _makeJobIDHTML (filePrefix));
		fprintf (stdout, "<FORM method='POST' name = 'plotForm' enctype='multipart/form-data' action='",BASE_CGI_URL_STRING,"rungnuplot.pl' target = '_blank'>\n<input type = 'hidden' value = '",filePrefix,"' name = 'inFile'><input type = 'hidden' value = '13' name = 'task'>");
		fscanf  ("../Formats/fubarplot","Raw",felplot);
		fprintf (stdout, felplot, "</form>");
	}
	else
	{
		fprintf (stdout, "set term ", gnuplotFormat);
		if (gnuplotFormat == "png") {
			fprintf (stdout, " ", size);
		}
		fprintf (stdout, "\nset output\nset nokey\nset xlabel '", xaxis, "'\nset ylabel '",yaxis, "'\nplot '-' lt -1 with ",style,"\n");
		pv = _ExecuteSQL  (slacDBID,"SELECT "+ tableKeys[optionOutput-4] +" FROM FUBAR_RESULTS ORDER BY Codon");

		if (optionOutput == 11)
		{
			for (k=0; k<Abs(pv); k+=1)
			{
				fprintf (stdout, "\n", k+1, "\t", Max(-100,Min(0+pv[k],100)));
			}		
		}
		else
		{
			for (k=0; k<Abs(pv); k+=1)
			{
				fprintf (stdout, "\n", k+1, "\t", pv[k]);
			}
		}
	}
}


if (optionOutput!=2)
{
	_closeCacheDB (slacDBID);
}

function normalizeNumber (n)
{
	n = 0+n;
	if (n > 0 && n < 0.0001)
	{
		return "&lt;0.0001";
	}
	return Format (n,4,2);
}
