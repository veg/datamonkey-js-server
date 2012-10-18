alignmentType = 1;


MPI_NODE_STATUS = {MPI_NODE_COUNT-1,1}; /* sequence indices being processed */


DataSet ds_in 						= ReadFromString (dataFileString);
DataSetFilter ds_fil 				= CreateFilter (ds_in,1);
GetString							(sequenceNames, ds_fil, -1);

fprintf 							(progressFilePath, "<DIV CLASS = 'RepClassSM'>Subtyping ", ds_in.species, " sequences</DIV><pre>");
fprintf 							(outputFilePath,"Index\tName\tSubtype\tSimplified Subtype\tSupport\tRecombination Support\tIntra-subtype Support\tBreakpoints\tSequence");


resultType 		= 1;

jobsFinished    = 0;
jobsFailed	    = 0;
_stratBySubtype = {};

for (seqID = 0; seqID < ds_in.species; seqID = seqID + 1)
{
	SendAJob (seqID);
}

/* clean up MPI jobs */

howManyPending = 0;
for (mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode+1)
{
	if (MPI_NODE_STATUS[mpiNode])
	{
		howManyPending += 1;
	}
}

for (; howManyPending; howManyPending = howManyPending-1)
{
	ReceiveAJob (0);
	fprintf ("../mpistates.txt", CLEAR_FILE, MPI_NODE_STATUS);
}

fprintf 						(resultsFile, CLOSE_FILE);



/*------------------------------------------------------------------------*/

function SendAJob (sequenceID)
{
	inOptions 	   = {};
	inOptions["0"] = sequenceNames[sequenceID];
	GetDataInfo (theSeq, ds_fil, sequenceID);
	inOptions["1"] = theSeq;
	inOptions["2"] = referenceAlignmentFileName;
	inOptions["3"] = ""+alignmentType;
	inOptions["4"] = ""+_minAlignmentScore;
	inOptions["5"] = ""+_minAlignmentScore2;
	
	for (mpiNode = 0; mpiNode < MPI_NODE_COUNT-1; mpiNode = mpiNode+1)
	{
		if (MPI_NODE_STATUS[mpiNode] == 0) /* free node */
		{
			break;
		}
	}
	if (mpiNode == MPI_NODE_COUNT-1) /* all busy */
	{
		mpiNode = ReceiveAJob (0);
	}
	
	/*
	fprintf (stdout, "[SEND] Sequence ", inOptions["0"], " to MPI node ", mpiNode + 1, "\n");
	*/
	
	MPI_NODE_STATUS [mpiNode] = sequenceID+1;
	MPISend (mpiNode+1, "../HBF/MPI_Wrapper.bf", inOptions);
	return 0;
}

/*------------------------------------------------------------------------*/

function ReceiveAJob (dummy)
{
	MPIReceive 		(-1, whichNode, returnValue);
	/*
	fprintf			(stdout, returnValue);
	*/
	whichNode	  	= whichNode-1;
	processedID  		= MPI_NODE_STATUS [whichNode]-1; 
	processedName 		= sequenceNames[processedID];
	MPI_NODE_STATUS 	[whichNode] = 0;
	ExecuteCommands		("returnAVL = " + returnValue);
	subtypeFound 		= returnAVL["SUBTYPE"];
	simpleSubtype 		= returnAVL["SIMPLE_SUBTYPE"];
	_stratBySubtype [simpleSubtype] = _stratBySubtype [simpleSubtype] + 1;
	if (Abs(subtypeFound) == 0)
	{
		jobsFailed = jobsFailed + 1;
	}	
	jobsFinished    = jobsFinished + 1;
	jobsLeft		= (ds_in.species-jobsFinished);
	if (jobsFinished-jobsFailed > 0)
	{
		timeEstimated	= _formatTimeString(jobsLeft/(jobsFinished-jobsFailed) * (Time(1)-startTimer));
	}
	else
	{
		timeEstimated   = "N/A";
	}
	if (Abs(processedName) > 50)
	{
		reportName = processedName[0][48] + "...";
	}
	else
	{
		reportName = processedName;
	}
	
	//fscanf  (PATH_TO_CURRENT_BF, "String", dummy);
	fscanf	(progressFilePath, REWIND, "Raw", currentContent);
	
	fprintf (progressFilePath, CLEAR_FILE, "<DIV class = 'FormClassSM'> Received  <i>", reportName, "</i> from node ", whichNode + 1, ". ",jobsFinished,"/",ds_in.species," sequences done. Estimated time left: ",timeEstimated, "<br>");
	if (Abs(subtypeFound) == 0) /* error */
	{
		fprintf (progressFilePath, "<span style = 'color:red'>Error/ alignment failed (e.g. env sequences submitted against a pol reference)</span></div>\n",currentContent);
		fprintf (outputFilePath, "\n", processedID+1, "\t", processedName, "\tError: alignment failed");
	}
	else
	{
		/*
		fprintf (progressFilePath, "<span style = 'color:green'>Inferred subtype:",simpleSubtype,"</span></div>\n",currentContent);
		*/
		supp = returnAVL["SUPPORT"];
		seq  = returnAVL["SEQUENCE"];
		bps	 = returnAVL["BREAKPOINTS"];
		recs = returnAVL["RECOMB"];
		recsi = returnAVL["INTRA"];
		term = returnAVL["TERMINATOR"];
		if (term)
		{
			fprintf (progressFilePath, "<span style = 'color:orange'>Inferred subtype:",simpleSubtype,". Note: this sequence mosaic was not completely mapped due to computational time constraints and may be unreliable.</span></div>\n",currentContent);
		}
		else
		{
			fprintf (progressFilePath, "<span style = 'color:green'>Inferred subtype:",simpleSubtype,"</span></div>\n",currentContent);
		}
		
		fprintf (outputFilePath, "\n", processedID+1, "\t", processedName, "\t", subtypeFound, "\t", simpleSubtype, "\t", supp, "\t", recs, "\t", recsi);
		
		if (Abs(seq))
		{
			fprintf (outputFilePath, "\t");
			for (bpID = 0; bpID < Rows (bps); bpID = bpID + 1)
			{
				if (bpID > 0)
				{
					fprintf (outputFilePath, ";");
				}
				fprintf (outputFilePath, bps[bpID][0], "(", bps[bpID][1], "-", bps[bpID][2], ")");
			}
			fprintf (outputFilePath, "\t", seq);
			fprintf (stdout, "\t", term);
		}
		if (resultType)
		{
			outPath = detailedResults + (processedID+1) + ".ps";
			ps 		= returnAVL["PS"];
			fprintf (outPath,CLEAR_FILE,ps);
			outPath = detailedResults + (processedID+1) + ".lf";
			ps 		= returnAVL["LF"];
			fprintf (outPath,CLEAR_FILE,ps);
		}
	}
	return 			whichNode;
}
