/* process and display additional plots for datamonkey CMS */

fscanf		(stdin,"String", filePrefix);

ExecuteAFile("../Shared/HyPhyGlobals.ibf");
ExecuteAFile("../Shared/GrabBag.bf");
ExecuteAFile	("../Shared/DBTools.ibf");

fprintf (stdout, "<script type='text/javascript' src='http://www.datamonkey.org/wz_tooltip.js'></script><H1 CLASS='SuccessCap'>CMS plots</H1>");

fprintf (stdout, _makeJobIDHTML (filePrefix));

fprintf (stdout,"<script type=\"text/javascript\" src=\"http://www.datamonkey.org/js/tabber.js\"><script type=\"text/javascript\" src=\"http://www.datamonkey.org/wz_tooltip.js\"></script><link rel=\"stylesheet\" href=\"http://www.datamonkey.org/js/tabber.css\" TYPE=\"text/css\" MEDIA=\"screen\"><script type=\"text/javascript\">document.write('<style type=\"text/css\">.tabber{display:none;}</style>');</script>");


_width = 350;
_height = 350;

fprintf ( stdout, "<div class = 'tabber'>\n" );

fprintf ( stdout, "<div class = 'tabbertab'>\n" );
fprintf ( stdout, "<H2>RATE PLOT</H2>\n" );
fprintf ( stdout, "<DIV class='RepClassSM'><div class = 'HelpfulTips'>Model-averaged rates estimated from the set of credible models. ",
				   "In each case the rate is averaged over the set of credible models and weighted by each model's Akaike weight, ",
				   "and provides a better approximation to the true rates than simply taking a point estimate of the rate. ",
				   " The rates are mapped to [0,1] intensities, where the maximum rate observed is 1 and  ",
				   " Square roots of intensities are plotted in the yellow (0) - red (1) or white (0) - black (1) color ranges.<p>",
				   " The residues are grouped into 4 classses according to the ",
				   "<a href='http://www.ncbi.nlm.nih.gov/pubmed/8977877' onmouseover=\"Tip('J Theor Biol. 1996 Nov 21;183(2):195-205.')\" class='REFERENCE'>Stanfel classification</a>",
				   " and substitutions within the diagonal blocks happen within the same class, i.e. are <b>conservative</b> according to Stanfel.",
				   "</div>" );
				   
jobFileName = BASE_CGI_URL_STRING + "renderPSImage.pl?file=" + filePrefix +"_cms.ma_matrix";
fprintf (stdout, "<p>Save as <a href='",jobFileName,".bw&doPDF=1'>[BW-PDF]</a><a href='",jobFileName,".col&doPDF=1'>[COLOR-PDF]</a><p><iframe name = 'pdf_frame' src='",jobFileName,".col' width='445px' height = '500px' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );
fprintf ( stdout, "</DIV>" );
fprintf ( stdout, "</div>" );

slacDBID 		 = _openCacheDB      (filePrefix);
gi2	= 0+(_ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM CMS_SUMMARY WHERE COL_KEY = 'BESTMODELRATES'" ))[0];
_closeCacheDB (slacDBID);

fprintf ( stdout, "<div class = 'tabbertab'>\n" );
fprintf ( stdout, "<H2>CLUSTER</H2>\n" );
fprintf ( stdout, "<DIV class='RepClassSM'><b>Substitution rates allocated to different rate classes in the best-fitting model.</b><div class = 'HelpfulTips'>The same residue can appear in different rate classes, because what is being clustered are <b>substitution rates</b> and not <b>residues</b></div>",
					           "<dl><dt class = 'DT1'>The <b>color</b> of each node is determined by which <a href='http://www.ncbi.nlm.nih.gov/pubmed/8977877' onmouseover=\"Tip('J Theor Biol. 1996 Nov 21;183(2):195-205.')\" class='REFERENCE'>Stanfel class</a> the residue at the node belongs to.",
					           "<dt class = 'DT2'> The <b>shape</b> of each node is determined by the polarity and charge of the corresponding residue",
					           "<dt class = 'DT1'> Each edge is <b>labeled</b> with the corresponding model averaged substitution rate for between the residues that are connected. This value represents the best estimate for the actual rate, because it uses information from multiple models.",
					           "<dt class = 'DT2'> The <b>line style</b> of each edge corresponds to the cluster affinity of the edge. Edges with high cluster affinities are well supported by the set of credible models.",
					           "</dl><p>",
					           " <img src = 'http://www.datamonkey.org/images/cms_legend.png' width = '398' height = '98' border = '1'>");
					           
for (k = 0; k < gi2; k=k+1)
{
	jobFileName = BASE_CGI_URL_STRING + "renderPSImage.pl?file=" + filePrefix + "_cms_" + k;
	fprintf (stdout, "<p>Save as <a href='",jobFileName,"&doPDF=1&doDOT=1'>[PDF]</a><br><iframe name = 'pdf_frame' src='",jobFileName,"&doDOT=1' width='392' height = '399' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );
}

/*fprintf ( stdout, "<p><b>Cluster plot legend</b>\n" );
legendFileName = BASE_HTML_URL_STRING + "cluster_legend";
fprintf (stdout, "<p>Save as <a href='",legendFileName,".pdf'>[PDF]</a><p><iframe name = 'pdf_frame' src='",legendFileName,".png' width='190' height = '340' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );
*/fprintf ( stdout, "</DIV>" );
fprintf ( stdout, "</div>" );

fprintf ( stdout, "<div class = 'tabbertab'>\n" );
fprintf ( stdout, "<H2>STANFEL</H2>\n" );
fprintf ( stdout, "<DIV class='RepClassSM'>Comparison of model averaged rates between substitutions that do/do not change <a href='http://www.ncbi.nlm.nih.gov/pubmed/8977877' onmouseover=\"Tip('J Theor Biol. 1996 Nov 21;183(2):195-205.')\" class='REFERENCE'>Stanfel class</a>.\n",
        		  "<div class = 'HelpfulTips'>Substitutions that do NOT change the amino-acid class are conservative, and traditionally are expected to happen at <b>higher</b> rates than those that change the class (radical). This trend does not hold for all alignments, especially if the gene is under positive selection.</div>"
        );
jobFileName = BASE_OUTPUT_PATH + filePrefix + "_cms_reliability.csv.stanfel.ps";
fscanf ( jobFileName, "Raw", rawString );
fprintf ( jobFileName, CLEAR_FILE, "\n<< /PageSize [", _width," ",_height, "] >> setpagedevice", rawString, );
jobFileName = BASE_CGI_URL_STRING + "renderPSImage.pl?file=" + filePrefix + "_cms_reliability.csv.stanfel";
fprintf (stdout, "<p>Save as <a href='",jobFileName,"&doPDF=1'>[PDF]</a><p><iframe name = 'pdf_frame' src='",jobFileName,"' width='",_width,"' height = '",_height,"' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );
fprintf ( stdout, "</DIV>" );
fprintf ( stdout, "</div>" );

fprintf ( stdout, "<div class = 'tabbertab'>\n" );
fprintf ( stdout, "<H2>CHARGE</H2>\n" );
fprintf ( stdout, "<DIV class='RepClassSM'>Comparison of model averaged rates between substitutions that do/do not change <b>charge</b>.\n", 
        		  "<div class = 'HelpfulTips'>Substitutions  between the residues carrying the same charge (although they could change other biochemical attributes) are traditionally expected to happen at <b>higher</b> rates than those that change the class (radical). This trend does not hold for all alignments, especially if the gene is under positive selection.</div>"
        );
jobFileName = BASE_OUTPUT_PATH + filePrefix + "_cms_reliability.csv.charge.ps";
fscanf ( jobFileName, "Raw", rawString );
fprintf ( jobFileName, CLEAR_FILE, "\n<< /PageSize [", _width," ",_height, "] >> setpagedevice", rawString, );
jobFileName = BASE_CGI_URL_STRING + "renderPSImage.pl?file=" + filePrefix + "_cms_reliability.csv.charge";
fprintf (stdout, "<p>Save as <a href='",jobFileName,"&doPDF=1'>[PDF]</a><p><iframe name = 'pdf_frame' src='",jobFileName,"' width='",_width,"' height = '",_height,"' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );
fprintf ( stdout, "</DIV>" );
fprintf ( stdout, "</div>" );

fprintf ( stdout, "<div class = 'tabbertab'>\n" );
fprintf ( stdout, "<H2>POLARITY</H2>\n" );
fprintf ( stdout, "<DIV class='RepClassSM'>Comparison of model averaged rates between substitutions that do/do not change <b>polarity</b>.\n" ,
        		  "<div class = 'HelpfulTips'>Substitutions  between the residues of the same polarity (although they could change other biochemical attributes) are traditionally expected to happen at <b>higher</b> rates than those that change the class (radical). This trend does not hold for all alignments, especially if the gene is under positive selection.</div>"
        );
jobFileName = BASE_OUTPUT_PATH + filePrefix + "_cms_reliability.csv.polarity.ps";
fscanf ( jobFileName, "Raw", rawString );
fprintf ( jobFileName, CLEAR_FILE, "\n<< /PageSize [", _width," ",_height, "] >> setpagedevice", rawString, );
jobFileName = BASE_CGI_URL_STRING + "renderPSImage.pl?file=" + filePrefix + "_cms_reliability.csv.polarity";
fprintf (stdout, "<p>Save as <a href='",jobFileName,"&doPDF=1'>[PDF]</a><p><iframe name = 'pdf_frame' src='",jobFileName,"' width='",_width,"' height = '",_height,"'400' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );
fprintf ( stdout, "</DIV>" );
fprintf ( stdout, "</div>" );

fprintf ( stdout, "<div class = 'tabbertab'>\n" );
fprintf ( stdout, "<H2>CORRELATION</H2>\n" );
fprintf ( stdout, "<DIV class='RepClassSM'>Correlation between five amino acid property-based distances from the paper by <a href='http://mbe.oxfordjournals.org/cgi/content/short/26/5/1155' onmouseover=\"Tip('Solvent Exposure Imparts Similar Selective Pressures across a Range of Yeast Proteins,<br> Mol Biol Evo 2009 26(5):1155-1161')\" class='REFERENCE'>Conant and Stadler</a> and substitution rates\n",
				  "The p-values are for rejecting the null hypothesis of no correlation, computed using Kendall's rank correlation with one sided (negative correlation) alternative.",
        		  "<div class = 'HelpfulTips'>Substitutions rates and biochemical distances may be expected to have a negative correlation in the neutral or negative selection evolutionary modes, because a major change in residue properties is likely to impart a large fitness change.",
        		  "Under positive selection, such substitutions may actually be favored. </div>"
        );

jobFileName = BASE_OUTPUT_PATH + filePrefix + "_cms_reliability.csv.correl.ps";
fscanf ( jobFileName, "Raw", rawString );
fprintf ( jobFileName, CLEAR_FILE, "\n<< /PageSize [", _width," ",_height, "] >> setpagedevice", rawString, );
jobFileName = BASE_CGI_URL_STRING + "renderPSImage.pl?file=" + filePrefix + "_cms_reliability.csv.correl";
fprintf (stdout, "<p>Save as <a href='",jobFileName,"&doPDF=1'>[PDF]</a><p><iframe name = 'pdf_frame' src='",jobFileName,"' width='",_width,"' height = '",_height,"' align = 'middle' frameborder='1' marginwidth='10'></iframe>" );
fprintf ( stdout, "</DIV>" );
fprintf ( stdout, "</div>" );



fprintf ( stdout, "</div>" ); /* END TABBER CLASS */