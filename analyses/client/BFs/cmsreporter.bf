ExecuteAFile("../Shared/HyPhyGlobals.ibf");
ExecuteAFile("../Shared/GrabBag.bf");

residueMap =  	  {{"Phe",
					"Leu",
					"Ile",
					"Met",
					"Val",
					"Ser",
					"Pro",
					"Thr",
					"Ala",
					"Tyr",
					"His",
					"Gln",
					"Asn",
					"Lys",
					"Asp",
					"Glu",
					"Cys",
					"Trp",
					"Arg",
					"Gly",
					"Mix"}};
					
aminoacidOrdering = "";
aminoacidOrdering = "FLIMVSPTAYHQNKDECWRG";

fscanf		(stdin,"String", filePrefix);
fscanf		(stdin,"Number", optionOutput);

DB_FIELD_MAP = {};
DB_FIELD_MAP [0]	= "RESIDUE_IDX1";
DB_FIELD_MAP [1]	= "RESIDUE_IDX2";
DB_FIELD_MAP [2]	= "RESIDUE_IDX1";
DB_FIELD_MAP [3]	= "RESIDUE_IDX2";
DB_FIELD_MAP [4]	= "STANFELCHNG";		
DB_FIELD_MAP [5]	= "POLARITYCHNG";
DB_FIELD_MAP [6]	= "CHARGECHNG";
DB_FIELD_MAP [7]	= "CHEMCOMP";
DB_FIELD_MAP [8]	= "POLARITY";
DB_FIELD_MAP [9]	= "VOLUME";
DB_FIELD_MAP [10]	= "ISOELEC";
DB_FIELD_MAP [11]	= "HYDROP";
DB_FIELD_MAP [12]	= "CLASS";
DB_FIELD_MAP [13]	= "BEST_RATE";
DB_FIELD_MAP [14]	= "MA_RATE";
DB_FIELD_MAP [15]	= "CLUSTERSUPP";
 
if (optionOutput!=2) /* option 2 is plots */
{
	ExecuteAFile	("../Shared/DBTools.ibf");
	slacDBID 		 = _openCacheDB      (filePrefix);
}

YEBO = {{ "Yes", "No" }};

if ( optionOutput < 2 ) { /* i.e: 0 = HTML, 1 = CSV */

	generalInfo = _ExecuteSQL  (slacDBID,"SELECT * FROM CMS_BYRESIDUE ORDER BY RESIDUE_IDX1,RESIDUE_IDX2");
	titleMatrix 		= {1,16};
	
	titleMatrix[0]		= "Res_1";
	titleMatrix[1]		= "AA_1";
	titleMatrix[2]		= "Res_2";
	titleMatrix[3]		= "AA_2";
	titleMatrix[4]		= "Stanfel_change";
	titleMatrix[5]		= "Polarity_change";
	titleMatrix[6]		= "Charge_change";
	titleMatrix[7]		= "Chemical_comp_diff";
	titleMatrix[8]		= "Polarity_diff";
	titleMatrix[9]		= "Volume_diff";
	titleMatrix[10]		= "Isoelec_diff";
	titleMatrix[11]		= "Hydropath_diff";
	titleMatrix[12]		= "Best_model_class";
	titleMatrix[13]		= "Best_model_rate";
	titleMatrix[14]		= "Model_averaged_rate";
	titleMatrix[15]		= "Cluster_support";
	
	if (optionOutput == 0)
	{
		for (k = 0; k < Columns(titleMatrix); k=k+1) 
		{
			titleMatrix[k] = titleMatrix[k] ^ {{"\\_"," "}};
		}
	}
	
	rowCount			= Abs ( generalInfo );
	colCount			= Columns ( titleMatrix );
	
	cmsInfo = {rowCount,colCount};
	
	for ( r=0;r<rowCount;r=r+1) {
		for ( c=0;c<colCount;c=c+1) {
			fieldLookup = DB_FIELD_MAP [c];
			if (Abs(fieldLookup) ) {
				if ( c < 2 || c > 3 ) {
					cmsInfo[r][c] = 0+(generalInfo[r])[fieldLookup];
				}
				else {
					cmsInfo[r][c] = cmsInfo[r][c-2];
				}
			}
			else {
				cmsInfo[r][c] = "N/A";
			}
		}
	}
	
	
	if ( optionOutput == 1 ) { /*CSV*/
		fprintf(stdout,titleMatrix[0]);
		for ( r=1;r<colCount; r=r+1 ) {
			fprintf(stdout,",",titleMatrix[r]);
		}
		for ( r=0;r<rowCount;r=r+1) {
			fprintf(stdout, "\n", aminoacidOrdering [ 0+cmsInfo[r][0] ], ",", residueMap[0+cmsInfo[r][0]], ",", aminoacidOrdering [0+cmsInfo[r][1]], ",", residueMap[0+cmsInfo[r][1]], "" );
			for ( c=4;c<colCount;c=c+1) {
				fprintf (stdout,",",cmsInfo[r][c]);
			}
		}
	}
	else { /* HTML*/
		fprintf ( stdout, "<H1 CLASS = 'SuccessCap'>Detailed CMS results</H1>");
		fprintf (stdout, _makeJobIDHTML (filePrefix));
		fprintf (stdout, "<DIV CLASS = 'RepClassSM'>Detailed analysis results (see legend at the bottom of the page)");
		fprintf (stdout, "\n<DIV class = 'HelpfulTips'>Residue pairs for which <u>Best</u> and <u>Model Averaged</u> rate estimates are noticeably different and whose rate distributions are multi-modal are <b>unreliable</b>, ",
							"and suggest that a larger dataset may be required to infer them accurately. <u>Cluster affinity</u> provides support for allocating a particular residue pair to its inferred rate class. Values &gt; 0.9 indiciate reliable assignments, and values &lt; 0.5 point to poorly supported assignments.</DIV>");
		fprintf (stdout, "<TABLE BORDER = '0' style = 'margin:10px'><TR class = 'TRReportT'>");
		for (r=0; r<colCount; r=r+1)
		{
			if ( ( r < 4 ) || ( r > 11 ) ) { 
				fprintf (stdout, "<TD>", titleMatrix[r], "</TD>");
			}
		}
		fprintf ( stdout, "<TD>Rate distribution</TD>" );
		fprintf (stdout, "</TR>\n");
		
		for (r=0; r<rowCount; r=r+1)
		{
			rowString = ""; rowString * 128;
			hitCount  = 0;
			trClass = "TRReport1";
			rowString *("<TD>" + aminoacidOrdering [ 0+cmsInfo[r][0] ] + "</TD><TD>" + residueMap [ 0+cmsInfo[r][0] ] + "</TD>");	
			rowString *("<TD>" + aminoacidOrdering [ 0+cmsInfo[r][1] ] + "</TD><TD>" + residueMap [ 0+cmsInfo[r][1] ] + "</TD>");
			
			rowString *("<TD>" + cmsInfo[r][12] + "</TD>");
				
			myWeight = (0+cmsInfo[r][13]); /*best model rate*/
			meColor  = ((1-myWeight)*255$1);
			meColor  = "<TD style = 'color: black; background-color: RGB(255,"+meColor+","+meColor+");'>";
			rowString * (meColor + cmsInfo[r][13] + "</TD>");
			
			myWeight = (0+cmsInfo[r][14]); /*model avg rate*/
			meColor  = ((1-myWeight)*255$1);
			meColor  = "<TD style = 'color: black; background-color: RGB(255,"+meColor+","+meColor+");'>";
			rowString * (meColor + cmsInfo[r][14] + "</TD>");
			
			rowString *("<TD>" + cmsInfo[r][15] + "</TD>");
			
			/*link to rate distribution code*/
			rowString * ("<TD><a href='" + BASE_CGI_URL_STRING + "cms_ratedistro.pl?file=" + filePrefix + "&res1=" + 0+cmsInfo[r][0] + "&res2=" + 0+cmsInfo[r][1] + "&mode=0'>[distribution]</a></TD>");
				
			rowString * 0;
			fprintf (stdout, "<TR class = 'TRReport1'>", rowString, "</TR>\n");
		}
		fprintf (stdout, "</TABLE>");
		
		
		fscanf ("../Formats/cms_report","Raw",cms_Legend);
		fprintf (stdout, cms_Legend);
		fprintf (stdout, "</DIV>");
		

		
	}
	

}