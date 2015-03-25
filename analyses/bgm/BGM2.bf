RequireVersion  ("0.9920060815");

function timeStamp (diff)
{
	hr = diff$3600;
	mn = diff%3600$60;
	sc = diff%60$1;
	
	if (hr<10)
	{
		tstamp = "0" + hr;
	}
	else
	{
		tstamp = ""+hr;
	}
	
	if (mn<10)
	{
		tstamp = tstamp + ":0" + mn;
	}
	else
	{
		tstamp = tstamp + ":" + mn;
	}

	if (sc<10)
	{
		tstamp = tstamp + ":0" + sc;
	}
	else
	{
		tstamp = tstamp + ":" + sc;
	}

	return tstamp;
}

/* ________________________________________________________________________	*/
function ReceiveJobs (unused)
{
	MPIReceive 	  		(-1, fromNode, resultString);	/* listen for messages from any node */
	howManyDone 		= howManyDone + 1;

	curStamp			= Time(1);
	soFar				= curStamp-timer;
	remaining			= 0;
	if (howManyDone    <= nsamples)
	{
		remaining = soFar * (nsamples+1-howManyDone)/howManyDone;
	}
	
	fprintf (intermediateHTML, 	 CLEAR_FILE, "Last results from node ", fromNode, " (", howManyDone, "/", (1+nsamples), " samples done)\n",
						  "Run time so far is ", timeStamp(soFar), "; projected finish in ", timeStamp(remaining), "\n");
	
	MPINodeState[fromNode-1][0] = 0;	/* set node status to idle */
	
	fprintf (MESSAGE_LOG, "Received replicate ", fromNode, " from node ", mpiNode+1, "\n");

	ExecuteCommands ("res = "+resultString+";");

	rowIndex = 0;
	if (MPINodeState[fromNode-1][1])
	{
		rowIndex = howManyDone-1;
	}	
	else
	{
		stashTrace = res[{{0,0}}][{{BGM_MCMC_MAXSTEPS$1000-1,0}}];
	}
	for (edge = 0; edge < resultColumns; edge = edge+1)
	{
		resultCache[rowIndex][edge] = res[edge][1];
	}
	return fromNode-1;
}



/* ________________________________________________________________________	*/

ExecuteAFile		("../Shared/globals.ibf");

fscanf 				(stdin, "String", _in_FilePath);
fscanf 				(stdin, "Number", _in_pvalue);
fscanf 				(stdin, "Number", genCodeID);
baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalPHP			= baseFilePath + ".out";
fprintf 			(finalPHP, CLEAR_FILE,_in_pvalue);
fprintf 			(intermediateHTML, CLEAR_FILE);
GetURL 				(analysisSpecRaw,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath+".bgm");
sscanf				(analysisSpecRaw,"Number,NMatrix,NMatrix",num_parents,site_map,ML_map);
GetURL 				(importLF,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath+".bgmfit");

lfSave			= baseFilePath + ".bgmfit";
fprintf			(lfSave,CLEAR_FILE,importLF);

num_parents 		= num_parents $ 1;
nsamples 			= 100;
BGM_MCMC_MAXSTEPS 	= 100000;
num_nodes 			= Rows(site_map) * Columns(site_map);

if (num_nodes < 2)
{
	fprintf (intermediateHTML, "DONE");
	return 0;
}

/* restore likelihood function */
ExecuteCommands 	(importLF);
GetString 			(lfid, LikelihoodFunction, 0);

ExecuteCommands("GetString (recep, "+lfid+", -1); filterID = (recep[\"Datafilters\"])[0];");
/*ExecuteCommands("GetDataInfo (filterChars, `filterID`, \"CHARACTERS\"); GetDataInfo (filterParameters, `filterID`, \"PARAMETERS\");");
filterExclusions = filterParameters["EXCLUSIONS"];
stateCount 		 = Columns (filterChars);
*/

treeid 						  	= (recep["Trees"])[0];
ExecuteCommands 			  	("branchNames = BranchName ("+treeid+",-1);");
nbranches 					  	= Rows(branchNames) * Columns(branchNames);	/* number of branches in tree */

lfSpool							= baseFilePath + ".lf";
ExecuteCommands 				("Export (lfEX,"+lfid+")");

fprintf				   (intermediateHTML, "Finished with the inital setup; dispatched BGM jobs to ", MPI_NODE_COUNT-1, " MPI nodes...\n");

/*
fprintf		                   (stdout, "Checkpoint 1\n");
*/

repStrSample 		= "genCodeID="+genCodeID+";BGM_MCMC_MAXSTEPS="+BGM_MCMC_MAXSTEPS+";doAncestralResample=1;site_map="+site_map+";nbranches="+nbranches+";num_nodes="+num_nodes+";num_parents="+num_parents+";ExecuteAFile(\""+BASE_CLUSTER_DIR+"Analyses/BGM/defineBGM.ibf\");MPI_NEXUS_FILE_RETURN=postp;\nEND;";
repStrNoSample		= "genCodeID="+genCodeID+";\nBGM_MCMC_MAXSTEPS="+BGM_MCMC_MAXSTEPS+";\ndoAncestralResample=0;\nbgm_data_matrix="+ML_map+";\nsite_map="+site_map+";\nnbranches="+nbranches+";\nnum_nodes="+num_nodes+";num_parents="+num_parents+"\n;fprintf	(MESSAGE_LOG, \"[CHECKPOINT 1]\\n\");ExecuteAFile(\""+BASE_CLUSTER_DIR+"Analyses/BGM/defineBGM.ibf\");MPI_NEXUS_FILE_RETURN=postp;fprintf   (MESSAGE_LOG, \"[CHECKPOINT 2]\\n\");\nEND;";

lfEXNS 				= lfEX ^ {{"END;$"}{repStrNoSample}};
lfEX 				= lfEX ^ {{"END;$"}{repStrSample}};


fprintf ("EX.dump", CLEAR_FILE, lfEX);
fprintf ("EXNS.dump",CLEAR_FILE,lfEXNS);


howManyDone			= 0;
timer			= Time(1);

/* ________________________________________________________________________	*/

timer = Time(1);

if (MPI_NODE_COUNT > 0)	/* farm sampling jobs out to cluster via MPI */
{
	MPINodeState = {MPI_NODE_COUNT-1, 2};	/* 	first column stores busy signal (1=busy)
												second column is 0 (original data) or 1 (resampled data) */
	
	
	resultColumns = num_nodes*num_nodes;
	resultCache = {nsamples+1, resultColumns}; /* the first one is for the ML ancestral map */
		
	MPINodeState[0][0] = 1;
	MPINodeState[0][1] = 0;
	MPISend (1, lfEXNS);	

		
	for (rep = 0; rep < nsamples; rep = rep + 1)
	{
		/* look for a node that isn't occupied */
		for (mpiNode = 0; mpiNode < MPI_NODE_COUNT - 1; mpiNode = mpiNode + 1)
		{
			if (MPINodeState[mpiNode][0] == 0)
			{
				break;
			}
		}
		
		
		if (mpiNode == MPI_NODE_COUNT-1)	/* everyone's busy */
		{
			mpiNode = ReceiveJobs (0);		/* master node waits and listens */
		}
	
		MPINodeState[mpiNode][0] = 1;
		MPINodeState[mpiNode][1] = 1;
		fprintf (MESSAGE_LOG, "Sent replicate ", rep, " to node ", mpiNode+1, "\n");
		MPISend (mpiNode+1, lfEX);				
		//fprintf ("last.send", CLEAR_FILE, MPI_LAST_SENT_MSG);
	}
	
	
	/* catch finished jobs here */
	runningJobs = MPINodeState[-1][0];
	runningJobs = ((Transpose(runningJobs))*runningJobs)[0];
	for (rep = 0; rep < runningJobs; rep = rep + 1)
	{
		ReceiveJobs (0);
	}
	
	fprintf (finalPHP, "\n", num_parents, "\n", site_map, "\n", resultCache, "\n", stashTrace);
}

fprintf (intermediateHTML,CLEAR_FILE,"DONE");
GetString (HTML_OUT, TIME_STAMP, 1);

/* record usage stats */
fprintf ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",num_parents,",",nbranches,",",num_nodes,",",Time(1)-timer,"\n");

