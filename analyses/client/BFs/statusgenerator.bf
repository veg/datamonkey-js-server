/*------------------------------------------------------------------------------------*/

fscanf (stdin,"String", fileName);

genCodeNames  = {{"Universal",
			      "Vertebrate mtDNA",
					"Yeast mtDNA",
					"Mold/Protozoan mtDNA",
					"Invertebrate mtDNA",
					"Ciliate Nuclear",
					"Echinoderm mtDNA",
					"Euplotid Nuclear",
					"Alt. Yeast Nuclear",
					"Ascidian mtDNA",
					"Flatworm mtDNA",
					"Blepharisma Nuclear"}};
					
analysisDataType = {}; 
/* 1 for codon, 2 for nucleotide, 4 for aminoacid */

analysisDataType["SLAC"]  	   		  = 1;
analysisDataType["Model"] 	   		  = 7;
analysisDataType["FEL"]   	   		  = 1;
analysisDataType["IFEL"]  	   		  = 1;
analysisDataType["REL"]   	   		  = 1;
analysisDataType["PARRIS"]     		  = 1;
analysisDataType["GABranch"]   		  = 1;
analysisDataType["SpidermonkeyBGM"]   = 7;
analysisDataType["Integrative"]   	  = 1;
analysisDataType["SBP"]   	  		  = 7;
analysisDataType["GARD"]   	  		  = 7;
analysisDataType["ASR"]   	  		  = 7;
analysisDataType["CMS"]				  = 1;
analysisDataType["EVF"]				  = 1;
analysisDataType["Toggle"]			  = 1;
analysisDataType["DEPS"]			  = 4;
analysisDataType["BSR"]			  	  = 1;
analysisDataType["MEME"]			  = 1;
analysisDataType["FUBAR"]			  = 1;
analysisDataType["PRIME"]			  = 1;
analysisDataType["FADE"]			  = 4;



ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/DBTools.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");

basePathVariable = BASE_OUTPUT_PATH + fileName;
slacDBID 		 = _openCacheDB      (fileName);

generalInfo = _ExecuteSQL  (slacDBID,"SELECT * FROM FILE_INFO");

timeSinceUpload = Time(1)-(0+(generalInfo[0])["Timestamp"]);
timeLeft		= 96*3600-timeSinceUpload;
seqCount		= 0+(generalInfo[0])["Sequences"];
genCodeID		= 0+(generalInfo[0])["genCodeID"];

stringRes  = {};

stringRes[0]  = doAnalysis("SLAC",maxSLACSize);
stringRes[1]  = doAnalysis("Model",maxSLACSize);
stringRes[2]  = doAnalysis("FEL",maxFELSize);
stringRes[3]  = doAnalysis("IFEL",maxFELSize);
stringRes[4]  = doAnalysis("REL",maxRELSize);
stringRes[5]  = doAnalysis("PARRIS",maxRELSize);
stringRes[9]  = doAnalysis("SBP",maxSBPSize);
stringRes[10] = doAnalysis("GARD",maxGARDSize);
stringRes[11] = doAnalysis("ASR",maxASRSize);
stringRes[12] = doAnalysis("CMS",maxCMSSize);
stringRes[13] = doAnalysis("EVF",maxEVFSize);
stringRes[14] = doAnalysis("Toggle",maxToggleSize);
stringRes[17] = doAnalysis("MEME",maxMEMESize);
stringRes[18] = doAnalysis("FUBAR",maxFUBARSize);
stringRes[19] = doAnalysis("PRIME",maxPRIMESize);

if (0+(generalInfo[0])["Partitions"] == 1)
{
	stringRes[6] = doAnalysis("GABranch",maxGABranchSize);
	stringRes[8] = doAnalysis("SpidermonkeyBGM",maxBGMSize);
	stringRes[15] = doAnalysis("DEPS",maxDEPSSize);
	stringRes[16] = doAnalysis("BSR",maxBSRSize);
    stringRes[20] = doAnalysis("FADE",maxFADESize);
}
else
{
	stringRes[6] = "<font color='brown'>This analysis can only be performed on datasets with a single tree.</font>";
	stringRes[8] = stringRes[6];
	stringRes[12] = stringRes[6]; /* for now set CMS to a single phylogeny */
	stringRes[15] = stringRes[6];
	stringRes[16] = stringRes[6];
	stringRes[20] = stringRes[6];
}

if (genCodeID >= 0)
{
	stringRes[7] = "No results. <span style='font-size:12px'>This option requires two more of SLAC, FEL, MEME, FUBAR, or REL results.</span>";
}
else
{
	stringRes[7] = doAnalysis("Integrative",maxSLACSize);
}

haveSlac = _TableExists (slacDBID, "SLAC_SUMMARY");

if (haveSlac)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SLAC_SUMMARY WHERE COL_KEY = 'dNdS'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SLAC_SUMMARY WHERE COL_KEY = 'PosSel'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SLAC_SUMMARY WHERE COL_KEY = 'NegSel'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SLAC_SUMMARY WHERE COL_KEY = 'PValue'");
	gi5 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SLAC_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[0] = "SLAC <a href='"+BASE_HTML_URL_STRING+fileName+"_slac.php'>[results]</a> "+getALink("SLAC","rerun") +". <span style='font-size:12px'> dN/dS = " + gi1[0] + 
				   "<br>" + gi2[0] + " positively and " + gi3[0] + " negatively selected sites (p=" + gi4[0] + "), based on "+ _getTreeDescriptionTag (0+gi5[0]) +
				   "</span>";
}

if (genCodeID != (-2))
{
	haveModel = _TableExists (slacDBID, "SLAC_MODEL");
	if (haveModel)
	{
		gi1 = (_ExecuteSQL  (slacDBID,"SELECT * FROM SLAC_MODEL"));
		if (Abs(gi1[0]) == 5)
		{
			gi1[0] = "0" + gi1[0];
		}
		stringRes[1] = "Model <a href='"+BASE_HTML_URL_STRING+fileName+"_model.php'>[results]</a> "+getALink("Model","rerun") +". <span style='font-size:12px'> Model string:  (" + processModelCode(gi1[0]) +")</span>";
	}
}
else
{
	haveModel = _TableExists (slacDBID, "PMODEL_RESULTS");
	if (haveModel)
	{
		gi1 = _ExecuteSQL  (slacDBID,"SELECT Model,cAIC FROM PMODEL_RESULTS ORDER BY cAIC LIMIT 1 ");
		stringRes[1] = "Model <a href='"+BASE_HTML_URL_STRING+fileName+"_pmodel.php'>[results]</a> "+getALink("PModel","rerun") +". <span style='font-size:12px'> cAIC-based model <b>" + (gi1[0])["Model"] +"</b></span>";
	}

}

haveFEL = _TableExists (slacDBID, "FEL_SUMMARY");

if (haveFEL)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FEL_SUMMARY WHERE COL_KEY = 'PosSel'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FEL_SUMMARY WHERE COL_KEY = 'NegSel'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FEL_SUMMARY WHERE COL_KEY = 'PValue'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FEL_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[2] = "FEL <a href='"+BASE_HTML_URL_STRING+fileName+"_fel.php'>[results]</a> "+getALink("FEL","rerun") +". <span style='font-size:12px'>" + 
				   gi1[0] + " positively and " + gi2[0] + " negatively selected sites (p=" + gi3[0] + "), based on "+ _getTreeDescriptionTag (0+gi4[0]) +
				   "</span>";
}

haveIFEL = _TableExists (slacDBID, "IFEL_SUMMARY");

if (haveIFEL)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM IFEL_SUMMARY WHERE COL_KEY = 'PosSel'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM IFEL_SUMMARY WHERE COL_KEY = 'NegSel'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM IFEL_SUMMARY WHERE COL_KEY = 'PValue'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM IFEL_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[3] = "IFEL <a href='"+BASE_HTML_URL_STRING+fileName+"_ifel.php'>[results]</a> "+getALink("IFEL","rerun") +". <span style='font-size:12px'>" + 
				   gi1[0] + " positively and " + gi2[0] + " negatively selected sites (p=" + gi3[0] + "), based on "+ _getTreeDescriptionTag (0+gi4[0]) + 
				   "</span>";
}

haveREL = _TableExists (slacDBID, "REL_SUMMARY");

if (haveREL)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM REL_SUMMARY WHERE COL_KEY = 'PosSel'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM REL_SUMMARY WHERE COL_KEY = 'NegSel'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM REL_SUMMARY WHERE COL_KEY = 'BF'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM REL_SUMMARY WHERE COL_KEY = 'dNdS'");
	gi5 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM REL_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[4] = "REL <a href='"+BASE_HTML_URL_STRING+fileName+"_rel.php'>[results]</a> "+getALink("REL","rerun") +". <span style='font-size:12px'> mean dN/dS = " + gi4[0] + "<br>"+ 
				   gi1[0] + " positively and " + gi2[0] + " negatively selected sites (Bayes Factor=" + gi3[0] + ") based on "+ _getTreeDescriptionTag (0+gi5[0]) + 
				   "</span>";
}

havePARRIS = _TableExists (slacDBID, "PARRIS_SUMMARY");

if (havePARRIS)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PARRIS_SUMMARY WHERE COL_KEY = 'TestP'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PARRIS_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[5] = "PARRIS <a href='"+BASE_HTML_URL_STRING+fileName+"_parris.php'>[results]</a> "+getALink("PARRIS","rerun") +". <span style='font-size:12px'>p-value for positive selection " + 
				   Format(0+gi1[0],8,4)+", based on "+ _getTreeDescriptionTag (0+gi4[0]) + "</span>";
}

haveGAB = _TableExists (slacDBID, "GAB_SUMMARY");

if (haveGAB)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM GAB_SUMMARY WHERE COL_KEY = 'Rates'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM GAB_SUMMARY WHERE COL_KEY = 'Improvement'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM GAB_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[6] = "GABranch <a href='"+BASE_HTML_URL_STRING+fileName+"_gabranch.php'>[results]</a> "+getALink("GABranch","rerun") +". <span style='font-size:12px'>" + gi1[0] + 
	" dN/dS rate classes, yielding an improvement of " + gi2[0]+ " c-AIC points over the single rate model, based on "+ _getTreeDescriptionTag (0+gi4[0]) +
				   "</span>";
}


haveBGM 		= _TableExists (slacDBID, "BGM_SUMMARY");
haveBGMModel	=  _TableExists (slacDBID, "BGM_MODEL");

if (haveBGM && haveBGMModel)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM BGM_SUMMARY WHERE COL_KEY = 'Parents'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM BGM_SUMMARY WHERE COL_KEY = 'Nodes'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM BGM_SUMMARY WHERE COL_KEY = 'Cutoff'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM BGM_SUMMARY WHERE COL_KEY = 'Edges'");
	gi5 = _ExecuteSQL  (slacDBID,"SELECT TreeMode FROM BGM_MODEL");
	stringRes[8] = "Spidermonkey/BGM <a href='"+BASE_HTML_URL_STRING+fileName+"_bgm.php'>[results]</a> "
					+ getALink("SpidermonkeyBGM","rerun") 
					+ ". <span style='font-size:12px'> A network with " 
					+ gi4[0] + " edges on " 
				    + gi2[0] + 
				    " nodes with " + gi1[0] + " max. parents<br>Posterior significance level " + gi3[0] +
				    ", based on "+ _getTreeDescriptionTag (0+gi5[0]) +"</span>";
}

haveSBP = _TableExists (slacDBID, "SBP_SUMMARY");

if (haveSBP)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SBP_SUMMARY WHERE COL_KEY = 'bestScores'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SBP_SUMMARY WHERE COL_KEY = 'canUseAICc'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM SBP_SUMMARY WHERE COL_KEY = 'ModelDescription'");
	
	ExecuteCommands ("bestScores = " + gi1[0]);
	
	stringRes[9] = "Single Breakpoint Recombination was run using the "+processModelCode(gi3[0])+ " model <a href='"+BASE_HTML_URL_STRING+fileName+"_sbp.php'>[results]</a> "
					+ getALink("SBP","rerun") 
					+ ".<br><span style='font-size:12px'> Recombination was<br>";
	if (bestScores[0][0]>=0)
	{
		stringRes[9] = stringRes[9] +  "<b>inferred</b> using AIC. Breakpoint at " + bestScores[0][2] + "; support " + Format(bestScores[0][3]*100,5,2) + "%";
	}
	else
	{
		stringRes[9] = stringRes[9] +  "<b>not inferred</b> using AIC";
	}
	stringRes[9] = stringRes[9] + "<br>";
	if (bestScores[1][0]>=0)
	{
		stringRes[9] = stringRes[9] +  "<b>inferred</b> using cAIC. Breakpoint at " + bestScores[1][2] + "; support " + Format(bestScores[1][3]*100,5,2) + "%";
	}
	else
	{
		if (0+gi2[0] > 0)
		{
			stringRes[9] = stringRes[9] +  "<b>not inferred</b> using cAIC";
		}
		else
		{
			stringRes[9] = stringRes[9] +  "cAIC is not applicable to this alignment (too few sites)";
		
		}
	}
	stringRes[9] = stringRes[9] + "<br>";
	if (bestScores[2][0]>=0)
	{
		stringRes[9] = stringRes[9] +  "<b>inferred</b> using BIC. Breakpoint at " + bestScores[2][2] + "; support " + Format(bestScores[2][3]*100,5,2) + "%";
	}
	else
	{
		stringRes[9] = stringRes[9] +  "<b>not inferred</b> using BIC";
	}
	stringRes[9] = stringRes[9] +  "</span>";
}

haveGARD = _TableExists (slacDBID, "GARD_SUMMARY");

if (haveGARD)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM GARD_SUMMARY WHERE COL_KEY = 'Breakpoints'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM GARD_SUMMARY WHERE COL_KEY = 'KHSupported'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM GARD_SUMMARY WHERE COL_KEY = 'ModelDescription'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM GARD_SUMMARY WHERE COL_KEY = 'AICImprovement'");
	
	ExecuteCommands ("bestScores = " + gi1[0]);
	
	stringRes[10] = "GARD recombination analysis was run using the "+processModelCode(gi3[0])+ " model. <a href='"+BASE_HTML_URL_STRING+fileName+"_gard.php'>[results]</a> "
					+ getALink("GARD","rerun") 
					+ ".<br><span style='font-size:12px'> Evidence of ";
	if ((0+gi1[0])>=0)
	{
		stringRes[10] = stringRes[10] +  "<b>" + gi1[0] + " breakpoints</b> was found using AIC<sub>c</sub>; an improvement of " + gi4[0] + " points was achieved over the model without recombination. <br>"
					   + "Of those, <b>" + gi2[0] + " </b>breakpoints also indicated significant topological incongruence using the KH test";
		if (gi2[0] != gi1[0])
		{
			stringRes[10] = stringRes[10] + "<br><i>Some of the breakpoints may be due to rate variation or heterotachy and not recombination</i>";
		}
	}
	else
	{
		stringRes[10] = stringRes[10] +  "recombination was <b>not inferred</b>";
	}
	stringRes[10]  = stringRes[10] +  "</span>";
}


haveASR = _TableExists (slacDBID, "ASR_SUMMARY");

if (haveASR)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE  FROM ASR_SUMMARY WHERE COL_KEY = 'ModelDescription'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE  FROM ASR_SUMMARY WHERE COL_KEY = 'TreeMode'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE  FROM ASR_SUMMARY WHERE COL_KEY = 'Outgroup'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE  FROM ASR_SUMMARY WHERE COL_KEY = 'Nodemap'");
	ExecuteCommands ("nodeMaps = " + gi4[0]);
	stringRes[11] = "Ancestral state reconstruction analysis was run using the "+processModelCode(gi1[0])+ " model. <a href='"+BASE_HTML_URL_STRING+fileName+"_asr.php'>[results]</a> "
					+ getALink("ASR","rerun") 
					+ ".<br><span style='font-size:12px'>"
					+ _getTreeDescriptionTag (0+gi2[0]) 
					+ " rooted on " + gi3[0] + " were used for inferrence, yielding " 
					+ Rows (nodeMaps) + " ancestral sequences (interior nodes of the strict consensus tree) for the entire alignment. </span>";

}

haveCMS = _TableExists ( slacDBID, "CMS_SUMMARY" );
if ( haveCMS ) {
	gi1 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM CMS_SUMMARY WHERE COL_KEY = 'MODELSPACE'" );
	gi2	= _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM CMS_SUMMARY WHERE COL_KEY = 'BESTMODELRATES'" );
	gi3 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM CMS_SUMMARY WHERE COL_KEY = 'BESTMODELIC'" );
	stringRes[12] = "Codon model selection was run using the (012345) model. <a href='"+BASE_HTML_URL_STRING+fileName+"_cms.php'>[results]</a> " + getALink("CMS","rerun")
					+ ".<br><span style='font-size:12px'>"
					+ gi1[0] + " codon models were evaluated yielding a best model with BIC = "
					+ gi3[0] + " and " 
					+ gi2[0] + " rate classes.</span>";
}


haveEVF = _TableExists ( slacDBID, "EVF_SUMMARY" );
if ( haveEVF ) {

	gi1 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM EVF_SUMMARY WHERE COL_KEY = 'LogL'" );
	gi2	= _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM EVF_SUMMARY WHERE COL_KEY = 'Rates'" );
	gi3 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM EVF_SUMMARY WHERE COL_KEY = 'MultiRate'" );
	gi4 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM EVF_SUMMARY WHERE COL_KEY = 'TreeMode'" );
	gi5 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM EVF_SUMMARY WHERE COL_KEY = 'AICc'" );
	
	stringRes[13] = "Evolutionary  model. <a href='"+BASE_HTML_URL_STRING+fileName+"_evf.php'>[results]</a> " + getALink("EVF","rerun")
					+ ".<br><span style='font-size:12px'> Log(L) of " 
					+ Format(0+gi1[0],7,2) + " and c-AIC of "
					+ Format(0+gi5[0],7,2) + " was achieved using  " 
					+ gi2[0] + " rate classes with " +  _getTreeDescriptionTag (0+gi4[0])  + "</span>";
}

haveTOGGLE = _TableExists ( slacDBID, "TOGGLE_SUMMARY" );
if ( haveTOGGLE ) {
	gi1 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM TOGGLE_SUMMARY WHERE COL_KEY = 'PValue'" );
	gi2 = _ExecuteSQL ( slacDBID,"SELECT COL_VALUE FROM TOGGLE_SUMMARY WHERE COL_KEY = 'ToggleSites'" );
	
	stringRes[14] = "TOGGLE <a href='"+BASE_HTML_URL_STRING+fileName+"_toggle.php'>[results]</a> "+getALink("TOGGLE","rerun") +". <span style='font-size:12px'>" + 
				   gi2[0] + " sites which toggle with respect to the wild-type amino acid (p=" + gi1[0] + ")</span>";
	
}


haveDEPS = _TableExists ( slacDBID, "DEPS_SUMMARY" );
if ( haveDEPS ) {
	gi1 = _ExecuteSQL ( slacDBID, "SELECT Residues FROM DEPS_SUMMARY" );
	gi2 = _ExecuteSQL ( slacDBID, "SELECT Sites FROM DEPS_SUMMARY" );
	gi3 = _ExecuteSQL ( slacDBID, "SELECT Model FROM DEPS_SUMMARY" );
	
	stringRes[15] = "DEPS <a href='"+BASE_HTML_URL_STRING+fileName+"_deps.php'>[results]</a> "+getALink("DEPS","rerun") +". <span style='font-size:12px'>" + 
				    gi1[0] + " residues which show evidence of directional selection at " + gi2[0] + " sites using the <b>" + gi3[0] + "</b> model</span>";
}

haveBSR = _TableExists ( slacDBID, "BSR_RESULTS" );
if ( haveBSR ) {
	gi1 = _ExecuteSQL ( slacDBID, "SELECT COUNT (*) FROM BSR_RESULTS WHERE HOLMPVALUE < 0.05" );
	
	stringRes[16] = "BSR <a href='"+BASE_HTML_URL_STRING+fileName+"_bsr.php'>[results]</a> "+getALink("BSR","rerun") +". <span style='font-size:12px'><b>" + 
				    gi1[0] + "</b> branches which show evidence of episodic diversifying selection at p &le; 0.05</span>";
}

haveMEME = _TableExists (slacDBID, "MEME_SUMMARY");

if (haveMEME)
{
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM MEME_SUMMARY WHERE COL_KEY = 'PosSel'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM MEME_SUMMARY WHERE COL_KEY = 'PValue'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM MEME_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[17] = "MEME <a href='"+BASE_HTML_URL_STRING+fileName+"_meme.php'>[results]</a> "+getALink("MEME","rerun") +". <span style='font-size:12px'>" + 
				   gi1[0] + " sites under episodic diversifying selection (p=" + gi3[0] + "), based on "+ _getTreeDescriptionTag (0+gi4[0]) +
				   "</span>";
}

haveFUBAR = _TableExists (slacDBID, "FUBAR_SUMMARY");
if (haveFUBAR) {
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FUBAR_SUMMARY WHERE COL_KEY = 'PosSel'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FUBAR_SUMMARY WHERE COL_KEY = 'NegSel'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FUBAR_SUMMARY WHERE COL_KEY = 'PosteriorProbability'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FUBAR_SUMMARY WHERE COL_KEY = 'TreeMode'");
	stringRes[18] = "FUBAR <a href='"+BASE_HTML_URL_STRING+fileName+"_fubar.php'>[results]</a> "+getALink("FUBAR","rerun") +". <span style='font-size:12px'><b>" + 
				   gi1[0] + "</b> sites under pervasive diversifying (and <b>" + gi2[0] + "</b> -- under pervasive purifying) selection (posterior prob &gt;" + gi3[0] + "), based on "+ _getTreeDescriptionTag (0+gi4[0]) +
				   "</span>";
}

havePRIME = _TableExists (slacDBID, "PRIME_SUMMARY");
if (havePRIME) {
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PRIME_SUMMARY WHERE COL_KEY = 'Conserved'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PRIME_SUMMARY WHERE COL_KEY = 'Modified'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PRIME_SUMMARY WHERE COL_KEY = 'pvalue'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PRIME_SUMMARY WHERE COL_KEY = 'TreeMode'");
	gi5 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PRIME_SUMMARY WHERE COL_KEY = 'PropertySet'");
	gi6 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM PRIME_SUMMARY WHERE COL_KEY = 'PropertyCount'");
	stringRes[19] = "PRIME <a href='"+BASE_HTML_URL_STRING+fileName+"_prime.php'>[results]</a> "+getALink("PRIME","rerun") +". <span style='font-size:12px'>Found <b>" + 
				   gi1[0] + "</b> sites where one or more of the <b>" + gi6[0] + "</b> tested properties (" + gi5[0] +") are conserved, and <b>" + gi2[0] + "</b> &mdash; where properties are selected for change (corrected p-value &lt;" + gi3[0] + "), based on "+ _getTreeDescriptionTag (0+gi4[0]) +
				   "</span>";
}


haveFADE = _TableExists (slacDBID, "FADE_SUMMARY");
if (haveFADE) {
	gi1 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FADE_SUMMARY WHERE COL_KEY = 'Selected'");
	gi2 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FADE_SUMMARY WHERE COL_KEY = 'posterior'");
	gi3 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FADE_SUMMARY WHERE COL_KEY = 'TreeMode'");
	gi4 = _ExecuteSQL  (slacDBID,"SELECT COL_VALUE FROM FADE_SUMMARY WHERE COL_KEY = 'Model'");
	stringRes[20] = "FADE <a href='"+BASE_HTML_URL_STRING+fileName+"_fade.php'>[results]</a> "+getALink("FADE","rerun") +
	               ". <span style='font-size:12px'>Found <b>" + 
				   gi1[0] + "</b> sites evolving under directional selection (posterior probability &gt;" + gi2[0] + "), based on "
				   + _getTreeDescriptionTag (0+gi3[0]) + " and the " + gi4[0] + " model of amino-acid substitution" + 
				   "</span>";
}

fprintf (stdout, "<TABLE BORDER = '0' style = 'margin:10px;max-width:98%;width:98%;'><TR CLASS = 'HeaderClassSM'><TH CLASS = 'HeaderClass' COLSPAN = 6 style = 'text-align:left; font-variant: small-caps;'>",
				 "Information for ",fileName,"</TH></TR>",
				 "<TR CLASS='ModelClass1' style='background-color: #004080; color: white;font-variant: small-caps;font-size:16px;'><TD>Partitions</TD><TD>Sequences</TD>",getTableHeader(genCodeID), "<TD>Time since uploaded</TD><TD>Expires in</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;'><TD>",(generalInfo[0])["Partitions"],
				 "</TD><TD>",seqCount,
				 "</TD><TD>",(generalInfo[0])["Sites"],
				 "</TD><TD>",getCodeName(genCodeID),
				 "</TD><TD>",convertSecondsIntoString(timeSinceUpload),
				 "</TD><TD>",convertSecondsIntoString(timeLeft),
				 "<br><a href = '",BASE_CGI_URL_STRING,"resetexpiry.pl?fileName=",fileName,"' CLASS = 'INFO' onmouseover = \"Tip('Delay expiry by 96 hours.')\">Reset expiry</a></TD></TR>");

if (genCodeID >= 0)
{
	fastaBlurb = "[FASTA]";			 
}
else
{
	fastaBlurb = "[ORIGINAL]";
}
				 
if (genCodeID != (-2))
{
	fprintf (stdout, 				 
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'><TD COLSPAN=3>Nucleotide sequences </TD><TD><a href='",
				 			BASE_CGI_URL_STRING,"showdata.pl?",fileName,"'>",fastaBlurb,"</a></TD><TD COLSPAN=3><a href='",BASE_CGI_URL_STRING,"seqPlot.pl?file=",fileName,"'>[PDF]</a>");
}
if (genCodeID != (-1))
{
	if (genCodeID >= 0)
	{
		ss = "Aminoacid translation";
		suffix = ".aa";
	}
	else
	{
		ss = "Aminoacid sequences";
		suffix = "";
	}
	fprintf (stdout,				 
				 "</TD></TR><TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'><TD COLSPAN=3>",ss,"</TD><TD><a href='",
				 			BASE_CGI_URL_STRING,"showdata.pl?",fileName,suffix,"'>",fastaBlurb,"</a></TD><TD COLSPAN=3><a href='",BASE_CGI_URL_STRING,"seqPlot.pl?file=",fileName,suffix,"'>[PDF]</a>");
}
				 
fprintf			(stdout, "</TD></TR>");


for (_mode = 0; _mode < 4; _mode = _mode+1)
{
	treeMode = _getTreeDescription(slacDBID, _mode);
	if (Abs(treeMode))
	{
		treeTag = _getTreeDescriptionTag (_mode);
		fprintf (stdout, "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'><TD COLSPAN=3>",treeTag,"</TD><TD><a href='",_getTreeLink(fileName,_mode,0),"'>[Newick]</a></TD><TD COLSPAN=3><a href='",_getTreeLink(fileName,_mode,1),"'>[PDF]</a></TD></TR>");
	}
}

if (haveSlac + haveFEL + haveREL + haveMEME + haveFUBAR >= 2)
{
	stringRes[7] = "<a href='"+BASE_CGI_URL_STRING+"integrative.pl?file="+fileName+"'>[Integrative Selection Analysis]</a>";
}


fprintf 		(stdout, 
				 "<TR CLASS='ModelClass1' style='background-color: #004080; color: white;font-variant: small-caps;font-size:16px;text-align:left;'>","<TD>Analysis</TD><TD COLSPAN = '5'>Status</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>SLAC</TD><TD COLSPAN = '5'>",stringRes[0],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>Model</TD><TD COLSPAN = '5'>",stringRes[1],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>Codon Model Selection</TD><TD COLSPAN = '5'>",stringRes[12],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>FEL</TD><TD COLSPAN = '5'>",stringRes[2],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>IFEL</TD><TD COLSPAN = '5'>",stringRes[3],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>TOGGLE</TD><TD COLSPAN = '5'>",stringRes[14],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>REL</TD><TD COLSPAN = '5'>",stringRes[4],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>PARRIS</TD><TD COLSPAN = '5'>",stringRes[5],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>GA-Branch</TD><TD COLSPAN = '5'>",stringRes[6],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>Integrative</TD><TD COLSPAN = '5'>",stringRes[7],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>Spidermonkey/BGM</TD><TD COLSPAN = '5'>",stringRes[8],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>Single Breakpoint Recombination</TD><TD COLSPAN = '5'>",stringRes[9],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>GARD</TD><TD COLSPAN = '5'>",stringRes[10],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>Ancestral State Reconstruction</TD><TD COLSPAN = '5'>",stringRes[11],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>Evolutionary Fingerprinting</TD><TD COLSPAN = '5'>",stringRes[13],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>Directional Evolution in Protein Sequences</TD><TD COLSPAN = '5'>",stringRes[15],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>Branch-site REL test for Episodic Diversifying Selection</TD><TD COLSPAN = '5'>",stringRes[16],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>Mixed Effects Model of Episodic Diversifying Selection</TD><TD COLSPAN = '5'>",stringRes[17],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>Fast Unconstrained Bayesian AppRoximation</TD><TD COLSPAN = '5'>",stringRes[18],"</TD></TR>",
				 "<TR CLASS='ModelClass2' style='font-size:14px;text-align:left;'>","<TD>PRoperty Informed Models of Evolution</TD><TD COLSPAN = '5'>",stringRes[19],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='font-size:14px;text-align:left;'>","<TD>FUBAR Approach to Directional Evolution</TD><TD COLSPAN = '5'>",stringRes[20],"</TD></TR>",
				 "<TR CLASS='ModelClass1' style='background-color: 803D03; color: white;font-variant: small-caps;font-size:16px;'><TD COLSPAN = 6><a href='",
				 			BASE_CGI_URL_STRING,"mpiJobStatus.pl?fileName=",fileName,"' style = 'color: white;'>[Check]</a> the cluster queue for related tasks</TD></TR>",
				 );

fprintf (stdout, "</TABLE>");

_closeCacheDB (slacDBID);


function convertSecondsIntoString (sec)
{
	if (sec<0)
	{
		return "<font color = 'brown'>Expired</font>";
	}
	return padTimeField(sec$86400)+":"+padTimeField((sec%86400)$3600)+":"+padTimeField((sec%3600)$60)+":"+padTimeField(sec%60);
}

/*-------------------------------------------*/

function padTimeField (t)
{
	if (t>0)
	{
		if (t<10)
		{
			return "0"+t;
		}
		return ""+t;
	}
	return "00";
}

/*-------------------------------------------*/

function checkDataType (dataType, genCodeID)
{
	if (genCodeID == (-1))
	{
		return (dataType$2)%2;
	}
	if (genCodeID == (-2))
	{
		return (dataType$4)%2;
	}
	return dataType%2;
}

/*-------------------------------------------*/

function dtString (genCodeID)
{
	if (genCodeID == (-1))
	{
		return "nucleotide";
	}
	if (genCodeID == (-2))
	{
		return "protein";
	}
	return "codon";
}

/*-------------------------------------------*/

function doAnalysis (analysisTag, seqBound)
{
	if (checkDataType (analysisDataType[analysisTag],genCodeID) == 0)
	{
		return "This analysis is not available for " + dtString (genCodeID) + " alignments";
	}
	if (seqBound >= seqCount)
	{
		return "No results. <span style='font-size:12px'>Set up the "+ getALink(analysisTag,analysisTag) +" analysis.</span>";
	}
	return "This analysis cannot be performed due to alignment size restriction.";
}

/*-------------------------------------------*/

function getALink (analysisTag, linkTag)
{
	return "<a href='"+BASE_CGI_URL_STRING+"analysisSetupPage.pl?file="+fileName+"&amp;type="+analysisTag+"'>["+ linkTag+"]</a>";
}

/*-------------------------------------------*/

function getTableHeader (genCodeID)
{
	if (genCodeID < 0)
	{
		return "<TD>Sites</TD><TD>Data type</TD>";
	}
	return "<TD>Codons</TD><TD>Genetic Code</TD>";
}

/*-------------------------------------------*/

function getCodeName (genCodeID)
{
	if (genCodeID == (-1))
	{
		return "Nucleotide";
	}
	if (genCodeID == (-2))
	{
		return "Protein";
	}
	return genCodeNames[genCodeID];
}

/*-------------------------------------------*/

function processModelCode (modelCode)
{
	if (genCodeID == (-2))
	{
		return modelCode;
	}

	while (Abs(modelCode) < 6)
	{
		modelCode = "0" + modelCode;
	}
	recoder = {};
	for (_k = 0; _k < 6; _k += 1)
	{
		if (recoder[modelCode[_k]] == 0)
		{
			recoder[modelCode[_k]] = Abs(recoder)+1;	
		}
	}	
	
	newModelCode = "";
	for (_k = 0; _k < 6; _k += 1)
	{
		newModelCode += "" + (recoder[modelCode[_k]] - 1);
	}
	
	if (newModelCode == "000000")
	{
		return "F81";
	}
	if (newModelCode == "010010")
	{
		return "HKY85";
	}
	if (newModelCode == "010020")
	{
		return "TN93";
	}
	if (newModelCode == "012345")
	{
		return "GTR";
	}

	
	return newModelCode;
}





