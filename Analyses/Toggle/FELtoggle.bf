/* 

INPUT:

1. file descriptor			: upload.numbers.1
2. gencodeid				: >=0 for a genetic code, Universal = 0
3. dnds_pvalue				: P value for rejection of null of no evidence of selection at a site
4. tree_mode				: where to get tree for analysis

3. neighborhood of amino acids only.

*/

RequireVersion  ("0.9920060815");
AA = "FLIMVSPTAY*HQNKDECWRG";

/* some standard datamonkey stuff */

fscanf  			(stdin,"String",_in_FilePath);
fscanf				(stdin,"Number", _in_GeneticCodeTable);
fscanf  			(stdin,"Number",_in_dNdSPValue);
fscanf				(stdin,"Number", treeMode );

timer = Time(1);

skipCodeSelectionStep = 1;
ExecuteAFile("../Shared/chooseGeneticCode.def");
ExecuteAFile("../Shared/globals.ibf");
ExecuteAFile("../Shared/GrabBag.bf");

finishedPatterns = 0;

GetURL 				(dataFileString,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath);
/*get the sites to analyze from the config file*/
GetURL 				(toggleConfigRaw,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath+".toggle.config");
sscanf				(toggleConfigRaw,"NMatrix",site_map);

rootOn = "";
analysisSpecRaw     = _getRawTreeSplits (_in_FilePath, "treeMode", "rootOn");

/*fprintf ( stdout, analysisSpecRaw, "\n" );*/


baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalRES			= baseFilePath + ".out";

ExecuteAFile	("../Shared/_MFReader_.ibf");
ExecuteAFile	( "toggleModelFunctions.ibf" );	 
ExecuteAFile	( "toggleConstants.ibf" );

SHORT_MPI_RETURN 	= 1;

dummy = GeneticCodeStuff ( _in_GeneticCodeTable );

fprintf				(intermediateHTML, CLEAR_FILE);
fprintf				(finalRES, CLEAR_FILE);

fprintf (intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 1</b> Fitting a nucleotide model to estimate relative branch lengths.</DIV>\n");

nucModelString = "";
nucModelString * 256;
nucModelString = "global kappa_inv = 1; 
				HKY85_Matrix =	{	{ *, t*kappa_inv, t, t*kappa_inv }
				{ t*kappa_inv, *, kappa_inv*t,	t }
				{ t, t*kappa_inv, *, kappa_inv*t }
				{ t*kappa_inv,	t, kappa_inv*t,	* } };\n";
ExecuteCommands ( nucModelString+"\nModel nucModel = (HKY85_Matrix, overallFrequencies, 1);" );
populateTrees ( "nucTree", fileCount );
ExecuteCommands (constructLF ("nuc_lf", "nucData", "nucTree", fileCount));
Optimize 		(nuc_res, nuc_lf);

vectorOfFrequencies = CodonFrequencies ( positionFrequencies, ModelMatrixDimension );
kweights = KWeightsCalc ( vectorOfFrequencies ); /* needs genetic code and vectorOfFrequencies */
global kappa := kappa_inv__;

labels = {{"sitenum", "amino_acid", "logL_null", "logL_alt", "LRT", "P", "omega", "rho", "kappa", "tx", "ty", "tz"}};

numTestSites = Rows ( site_map );
site_map = site_map % 0;
ReportSiteInfo = { totalCodonCount*20,Columns(labels)}["1"];

vOffset = 0; /* offset for the number of sites per partition */
treeLengths 		= {fileCount,1};

FIRSTPART = 1;

for ( fileID = 1; fileID <= fileCount; fileID += 1) {
	if ( FIRSTPART ) {
		fprintf (intermediateHTML, "<DIV class = 'RepClassSM'><b>Phase 2</b> Starting site-wise analysis of amino acid toggling for each potential wildtype</DIV>\n" );
		fprintf (intermediateHTML, "<DIV class = 'RepClassSM'>Data partition: ", fileID, "</DIV>\n" );
		FIRSTPART = 0;
	}
	else {
		fprintf (intermediateHTML, "<DIV class = 'RepClassSM'>Data partition: ", fileID, "</DIV>\n" );
	}
	
	ExecuteCommands ( "branchNames = BranchName ( nucTree_" + fileID + ", -1 );" );
	tvec = { Columns(branchNames), 1 };
	for ( k = 0; k < Columns(branchNames); k = k + 1 ) {
		thisbranch = branchNames [ k ];
		ExecuteCommands ( "tvec [ k ] = nucTree_" + fileID + "." + thisbranch + ".t;" ); 
	}

	treeLengths[fileID-1] =  Eval( "+BranchLength(nucTree_" + fileID + ",-1 )" );
	
	
	totalbranches = Columns(branchNames);
	ExecuteCommands ( "partCodonSites	= filteredData_" + fileID + ".sites;" );
	ExecuteCommands ( "partUniqueSites = filteredData_" + fileID + ".unique_sites" );
	ExecuteCommands ( "ComputeConsensusAA ( partCodonSites, \"ds_" + fileID + "\" );" );
	ExecuteCommands ( "GetDataInfo ( dupInfo, filteredData_" + fileID + ");" );
	
	startSite = vOffset;
	endSite = vOffset + partCodonSites;
	partTestSites = 0;
	part_site_map = {};
	for ( malemaLovesGoats = 0; malemaLovesGoats < numTestSites; malemaLovesGoats = malemaLovesGoats + 1 ) 
	{
		if ( ( site_map [ malemaLovesGoats ] >= startSite ) && ( site_map [ malemaLovesGoats ] <=endSite ) ) 
		{	
			part_site_map [ partTestSites ] = site_map [ malemaLovesGoats ] - vOffset - 1; /*site_map was 1-indexed*/
			partTestSites = partTestSites + 1;
		}
	}
	
	MPINodeState = {MPI_NODE_COUNT-1,2}; /*vector containing state info for each mpi node */
	NodeInfo = {MPI_NODE_COUNT,4}; /*vector containing info on the nodes current job. ie. null(0)/alternate(1) model; true site number, amino acid number,starttime*/
	alreadyDone = {partUniqueSites,1}["0"]; /* populate with 1 when the last amino acid job is launched*/
	
	
	siteLastReported = -1;
	jobnum = 0;
	received = 0;
	while ( received < partTestSites*20*2 ) { /* loops on completed jobs received, else misses the last n jobs where n = number of nodes */
		if ( jobnum < partTestSites*20*2 ) { /* find available node if there are still sites remaining to be optimised */
			for ( mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode + 1 ) { /*determines whether a node is busy*/ 
				if ( MPINodeState[mpiNode][0] == 0 )	{ /* if not busy break the loop */
					break;
				}
			}
		}
		else { /* else set mpiNode = MPI_NODE_COUNT to receive jobs */
			mpiNode = MPI_NODE_COUNT-1;
		}
		if ( mpiNode==MPI_NODE_COUNT-1 ) { /*all nodes are busy or all sites are done: receive completed jobs from compute nodes */
			fromNode = ReceiveJobs ( 0 );
			
			if ( NodeInfo[fromNode-1][2] < 10 ) { /*ie since stop codon amino acid 10 is excluded */
				idx = NodeInfo[fromNode-1][1]*20 + NodeInfo[fromNode-1][2];
			}
			else {
				idx = NodeInfo[fromNode-1][1]*20 + NodeInfo[fromNode-1][2] - 1;
			}
			thisIdx = NodeInfo[fromNode-1][1] - vOffset; /*site index in partition */
			ReportSiteInfo [ idx ][ 0 ] = NodeInfo[fromNode-1][1] + 1; /* 1 based index on report */
			ReportSiteInfo [ idx ][ 1 ] = NodeInfo[fromNode-1][2]; /* amino acid code */
			
			/*spool likelihood function to file */
			/*
			tempFile = baseFilePath + "." + "site_" + NodeInfo[fromNode-1][1] + ".aa_" + NodeInfo[fromNode-1][2] + ".job_" + NodeInfo[fromNode-1][0] + ".res";
			fprintf (tempFile, CLEAR_FILE, result_String );
			*/
			
			if ( NodeInfo[fromNode-1][0] == 0 ) {
				ReportSiteInfo [ idx ][ 2 ] = lf_MLES[1][0];
			}
			else { 
				ReportSiteInfo [ idx ][ 3 ] = lf_MLES[1][0];
				ReportSiteInfo [ idx ][ 6 ] = lf_MLE_VALUES ["c_alt"];
				ReportSiteInfo [ idx ][ 7 ] = lf_MLE_VALUES ["rho_alt"];
				ReportSiteInfo [ idx ][ 8 ] = lf_MLE_VALUES ["kappa"];
				ReportSiteInfo [ idx ][ 9 ] = lf_MLE_VALUES ["k1"];
				ReportSiteInfo [ idx ][ 10 ] = (1-lf_MLE_VALUES ["k1"])*(lf_MLE_VALUES ["k2"]);
				ReportSiteInfo [ idx ][ 11 ] = (1-lf_MLE_VALUES ["k1"])*(1-lf_MLE_VALUES ["k2"]);
			}
			
			if ( ( ReportSiteInfo [ idx ][ 2 ] < 0 ) && ( ReportSiteInfo [ idx ][ 3 ] < 0 ) ) {
				ReportSiteInfo [ idx ][ 4 ] = 2*(ReportSiteInfo [ idx ][ 3 ] - ReportSiteInfo [ idx ][ 2 ]);
				ReportSiteInfo [ idx ][ 5 ] = 1-CChi2 ( 2*(ReportSiteInfo [ idx ][ 3 ] - ReportSiteInfo [ idx ][ 2 ]), 2 );
			}
			received = received + 1;
		}
		else { /* send job to empty node found above */
				siteToDo = part_site_map [ jobnum$40 ];
				if ( siteToDo != siteLastReported ) {
					fprintf ( intermediateHTML, "<DIV class = 'RepClassSM'>Analyzing site ", siteToDo+1, "</DIV>\n" );
					siteLastReported = siteToDo;
				}
				if ( ( (jobnum$2) % 20 )  < 10 ) {
					aanum = (jobnum$2)%20;
				}
				else {
					aanum = (jobnum$2)%20 + 1;
				}  
				filterString = "";
				uniqueSiteID = dupInfo [ siteToDo ];
				if ( alreadyDone [ uniqueSiteID ] == 0 ) { /*only launch job if it is the first unique site*/
					
					filterString = filterString + ((siteToDo)*3) + "-" + ((siteToDo)*3 + 2);
					ExecuteCommands ( "DataSetFilter AAFilter" + siteToDo + "= CreateFilter ( ds_" + fileID + ",3,filterString,\"\",GeneticCodeExclusions);" ); 
					caa = ConsensusAAMatrix [ siteToDo ][ 1 ];
					global k1 = 0.5;
					global k2 = 0.5;
					k1 :< 1;
					k2 :< 1;
					global R = 1;
					
					if ( jobnum % 2 == 0 ) { /* null job */
						NodeInfo [ mpiNode ][ 0 ] = 0; 
						global c = Random ( 0,1 );
						c :< 1;
						global rho = Random ( 0,1 );
						rho :< 1;
						PopulateModelMatrixAA_GYNull (ModelMatrixDimension, aanum, vectorOfFrequencies );
						modelType = 0;
					}
					else { /* alt job change the variable names of those constrained in the null model else the constraint seems to carry through even after ClearConstraints */
						NodeInfo [ mpiNode ][ 0 ] = 1; 
						global c_alt = Random ( 0,1 );
						c_alt :< 1;
						global rho_alt = Random ( 1,5 );
						PopulateModelMatrixAA_GYAlt (ModelMatrixDimension, aanum, vectorOfFrequencies );
						modelType = 1;
					}
					
					ExecuteCommands ( "Model model = ( AATransMatrix" + aanum + ", vectorOfFrequencies, 0 );" );
					ExecuteCommands ( "Tree tree = " + treeStrings[fileID] + ";" );
					
					branchNames = BranchName ( tree, -1 );
					for ( k = 0; k < totalbranches; k = k + 1 ) {
						thisbranch = branchNames [ k ];
						ExecuteCommands ( "tree." + thisbranch + ".t := (1/R)*" + tvec[ k ] + ";" );
					}
					
					ExecuteCommands ( "LikelihoodFunction lf = ( AAFilter" + siteToDo + ", tree );" );
					
					/*fprintf ( stdout, "job = ", jobnum, "; full data site number = ", siteToDo + vOffset, "; paritition site number = ", siteToDo, "; aanum = ", aanum, "; model = ", modelType,  "\n" );*/
					
					NodeInfo [ mpiNode ][ 1 ] = siteToDo + vOffset; /* full data set site number */
					NodeInfo [ mpiNode ][ 2 ] = aanum;
					NodeInfo [ mpiNode ][ 3 ] = Time(0);
					MPINodeState[mpiNode][0] = 1; /*set the state as busy */
					MPINodeState[mpiNode][1] = Time(0); /* set the start time */
					MPISend ( mpiNode+1, lf ); /*sending to mpiNode+1 since 0 remains the master node */
					
					/*
					tempFile = baseFilePath + "." + "site_" + NodeInfo[mpiNode][1] + ".aa_" + NodeInfo[mpiNode][2] + ".job_" + NodeInfo[mpiNode][0] + ".lf";
					fprintf (tempFile, CLEAR_FILE, MPI_LAST_SENT_MSG );
					*/
					
					if ( ( aanum == 20 ) && ( modelType == 1 ) ) {
						alreadyDone [ uniqueSiteID ] = 1;
					} 
				}
				else { /*increment received so we don't hang on waiting for duplicate site jobs to complete */
					received = received + 1;
				}
				jobnum = jobnum + 1;
		}
		/* copy results from duplicated sites for the current partition */
		for ( ii = 0; ii < Rows ( dupInfo ); ii = ii + 1 ) {
			if ( dupInfo [ ii ] != ii ) {
				for ( aa = 0; aa < 21; aa = aa + 1 ) {
					if  ( aa != 10 ) {
						aaidx = aa;
					}
					else {
						aaidx = aa - 1;
					}
					ReportSiteInfo [ ii*20+aaidx][ 0 ] = ii;
					ReportSiteInfo [ ii*20+aaidx][ 1 ] = aa;
					for ( jj = 2; jj < Columns ( labels); jj = jj + 1 ) {
						ReportSiteInfo [ ii*20+aaidx ][ jj ] = ReportSiteInfo [ dupInfo[ii]*20 + aaidx ][ jj ];
					}
				}
			}
		}
	}
	vOffset = vOffset + partCodonSites;
}

countToggle = 0;
FinalSiteInfo = { numTestSites*20, Columns ( ReportSiteInfo ) };
for ( ii = 0; ii < numTestSites; ii = ii + 1 ) {
	siteToDo = site_map [ ii ] - 1;
	gotAA = 0;
	for ( aa = 0; aa < 20; aa = aa + 1 ) {
		for ( jj = 0; jj < Columns ( ReportSiteInfo ); jj = jj + 1 ) {
			FinalSiteInfo [ ii*20+aa ][ jj ] = ReportSiteInfo [ siteToDo*20+aa ][ jj ];
		}
		if ( gotAA == 0 && FinalSiteInfo[ ii*20+aa][ 5 ] < _in_dNdSPValue/20 ) 
		{
			countToggle = countToggle + 1;
			gotAA = 1;
		}
	}
}

fprintf (finalRES, _in_dNdSPValue, "\n", treeMode, "\n", FinalSiteInfo,"\n", treeLengths, "\n", _in_GeneticCodeTable, "\n", site_map );
fprintf (intermediateHTML,CLEAR_FILE,"DONE");

GetString (HTML_OUT, TIME_STAMP, 1);
fprintf ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",ds_0.species,",",ds_0.sites/3,",",Time(1)-timer,",010010,",numTestSites,",",countToggle,",",_in_dNdSPValue,"\n");


