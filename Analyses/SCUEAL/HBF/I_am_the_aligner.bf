alignOptions = {};if (alignmentType == 0){	alignOptions ["SEQ_ALIGN_CHARACTER_MAP"]="ARNDCQEGHILKMFPSTWYV";		scoreMatrix = 	{	{ 7,-7,-7,-4, -10, -11,-4,-3, -10,-6,-9,-9,-7, -13,-3,-2, 1, -16, -15, 0,-5,-5,-3, -17}	{-7, 7,-5, -11,-8,-2,-7,-2, 0,-6,-6, 2,-3, -12,-4,-2,-2,-5,-9, -10,-7,-3,-3, -17}	{-7,-5, 8, 2,-9,-6,-6,-7, 0,-6, -12, 0, -10, -12,-9, 1, 0, -17,-3, -10, 6,-6,-3, -17}	{-4, -11, 2, 8, -14, -10, 0,-2,-3, -11, -15,-7, -13, -15, -13,-5,-6, -16,-6,-5, 7, 0,-3, -17}	{ -10,-8,-9, -14,11, -16, -15,-5,-7, -11,-9, -13, -14, 0, -12,-1,-6,-2, 0,-8, -10, -16,-5, -17}	{ -11,-2,-6, -10, -16, 8,-2, -10, 0, -12,-4, 0,-8, -12,-1,-9,-8, -14,-9, -13,-7, 6,-4, -17}	{-4,-7,-6, 0, -15,-2, 7,-1,-9, -12, -15,-1, -10, -17, -13, -11,-8, -15, -12,-5, 0, 6,-4, -17}	{-3,-2,-7,-2,-5, -10,-1, 7, -10, -11, -14,-6, -12,-9, -11,-1,-7,-5, -14,-5,-4,-3,-4, -17}	{ -10, 0, 0,-3,-7, 0,-9, -10,10, -10,-4,-5, -10,-6,-3,-6,-6, -11, 2, -14,-1,-2,-3, -17}	{-6,-6,-6, -11, -11, -12, -12, -11, -10, 7, 0,-7, 0,-2, -10,-4, 0, -14,-9, 2,-7, -12,-2, -17}	{-9,-6, -12, -15,-9,-4, -15, -14,-4, 0, 6, -10, 0, 0,-3,-5,-8,-6,-8,-4, -13,-6,-4, -17}	{-9, 2, 0,-7, -13, 0,-1,-6,-5,-7, -10, 7,-4, -14,-9,-5,-1, -12, -13,-9,-1,-1,-2, -17}	{-7,-3, -10, -13, -14,-8, -10, -12, -10, 0, 0,-4,10,-7, -11,-9,-1, -11, -15, 0, -11,-9,-3, -17}	{ -13, -12, -12, -15, 0, -12, -17,-9,-6,-2, 0, -14,-7,10, -11,-5, -10,-5, 1,-5, -13, -14,-3, -17}	{-3,-4,-9, -13, -12,-1, -13, -11,-3, -10,-3,-9, -11, -11, 8,-1,-3, -13, -11, -12, -10,-3,-5, -17}	{-2,-2, 1,-5,-1,-9, -11,-1,-6,-4,-5,-5,-9,-5,-1, 8, 0, -12,-6,-9, 0, -10,-3, -17}	{ 1,-2, 0,-6,-6,-8,-8,-7,-6, 0,-8,-1,-1, -10,-3, 0, 7, -16, -10,-4,-2,-8,-2, -17}	{ -16,-5, -17, -16,-2, -14, -15,-5, -11, -14,-6, -12, -11,-5, -13, -12, -16,10,-4, -16, -16, -14,-8, -17}	{ -15,-9,-3,-6, 0,-9, -12, -14, 2,-9,-8, -13, -15, 1, -11,-6, -10,-4,10, -12,-4, -10,-4, -17}	{ 0, -10, -10,-5,-8, -13,-5,-5, -14, 2,-4,-9, 0,-5, -12,-9,-4, -16, -12, 7,-7,-7,-3, -17}	{-5,-7, 6, 7, -10,-7, 0,-4,-1,-7, -13,-1, -11, -13, -10, 0,-2, -16,-4,-7, 7,-2,-4, -17}	{-5,-3,-6, 0, -16, 6, 6,-3,-2, -12,-6,-1,-9, -14,-3, -10,-8, -14, -10,-7,-2, 6,-4, -17}	{-3,-3,-3,-3,-5,-4,-4,-4,-3,-2,-4,-2,-3,-3,-5,-3,-2,-8,-4,-3,-4,-4,-3, -17}	{ -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, 1}	};		alignOptions ["SEQ_ALIGN_SCORE_MATRIX"] = 	scoreMatrix[{{0,0}}][{{19,19}}];	alignOptions ["SEQ_ALIGN_GAP_OPEN"]		= 	40;	alignOptions ["SEQ_ALIGN_GAP_OPEN2"]	= 	20;	alignOptions ["SEQ_ALIGN_GAP_EXTEND"]	= 	10;	alignOptions ["SEQ_ALIGN_GAP_EXTEND2"]	= 	5;}else{	alignOptions ["SEQ_ALIGN_CHARACTER_MAP"]="ACGT";	scoreMatrix = {	{5,-1,-4,-4}	{-4,5,-4,-4}	{-4,-4,5,-4}	{-4,-4,-4,5}	};			alignOptions ["SEQ_ALIGN_SCORE_MATRIX"] = 	scoreMatrix;	alignOptions ["SEQ_ALIGN_GAP_OPEN"]		= 	10;	alignOptions ["SEQ_ALIGN_GAP_OPEN2"]	= 	5;	alignOptions ["SEQ_ALIGN_GAP_EXTEND"]	= 	1;	alignOptions ["SEQ_ALIGN_GAP_EXTEND2"]	= 	1;}alignOptions ["SEQ_ALIGN_AFFINE"]		=   1;alignOptions ["SEQ_ALIGN_NO_TP"]		=   1;outputAlignment = "";if (alignmentType == 0){	ExecuteAFile  ("chooseGeneticCode.def");		codonToAAMap = {};	codeToAA 	 = "FLIMVSPTAYXHQNKDECWRG";		nucChars = "ACGT";		for (p1=0; p1<64; p1=p1+1)	{		codon = nucChars[p1$16]+nucChars[p1%16$4]+nucChars[p1%4];		ccode = _Genetic_Code[p1];		codonToAAMap[codon] = codeToAA[ccode];	}}	SetDialogPrompt 			("Reference alignment:");DataSet ref_ds 			  =  ReadDataFile (PROMPT_FOR_FILE);referenceAlignmentPath	  = LAST_FILE_PATH;if (verboseFlag){	fprintf 				   (stdout, "Read ", ref_ds.species-1, " reference sequences.\n");}refTree	= DATAFILE_TREE;fscanf (stdin,"String",sequenceName);fscanf (stdin,"String",sequenceData);inputAlignment = ">"+sequenceName+"\n"+sequenceData;DataSet ds_to_align = ReadFromString (inputAlignment);seqCount			= ds_to_align.species;if (verboseFlag){	fprintf (stdout, "Read ", seqCount, " sequences.\n");}DataSetFilter	ref_filter		= CreateFilter (ref_ds,1);DataSetFilter	qry_filter		= CreateFilter (ds_to_align,1);GetInformation 	(refSeqs, ref_filter);GetInformation 	(qrySeqs, qry_filter);refSequence	= refSeqs[ref_ds.species-1];for (_currentSeqID = 0; _currentSeqID < ds_to_align.species; _currentSeqID = _currentSeqID + 1){	qrySequence = qrySeqs[_currentSeqID];	GetString 	(qryName, ds_to_align, _currentSeqID);	if (verboseFlag)	{		fprintf (stdout, "\nWorking on ", qryName, " ", 1+_currentSeqID, "/", ds_to_align.species , "\n");	}	toAlignDS	= ">REFERENCE\n" + refSequence + "\n>" + qryName + "\n"+qrySequence;		DataSet		   unal = ReadFromString (toAlignDS);	DataSetFilter  filteredData 	= CreateFilter	(unal,1);	GetInformation (UnalignedSeqs,filteredData);	/* preprocess sequences */		for (seqCounter = 0; seqCounter < Columns(UnalignedSeqs); seqCounter = seqCounter+1)	{		aSeq = UnalignedSeqs[seqCounter];		UnalignedSeqs[seqCounter] = aSeq^{{"[^a-zA-Z]",""}};		UnalignedSeqs[seqCounter] = UnalignedSeqs[seqCounter]^{{"^N+",""}};		UnalignedSeqs[seqCounter] = UnalignedSeqs[seqCounter]^{{"N+$",""}};	}	/* determine reading frames	*/	ProteinSequences = {};	AllTranslations  = {};	ReadingFrames	 = {};	StopCodons		 = {};	StopPositions    = {};		if (verboseFlag)	{		fprintf (stdout, "\nDetecting reading frames for each sequence...\n");	}		if (alignmentType == 0)	{		frameCounter  = {3,1};		stillHasStops = {};				for (seqCounter = 0; seqCounter < Columns(UnalignedSeqs); seqCounter = seqCounter+1)		{			aSeq = UnalignedSeqs[seqCounter];			seqLen = Abs(aSeq)-2;						minStops = 1e20;			tString = "";			rFrame = 0;						stopPosn = {3,2};			allTran  = {3,1};			for (offset = 0; offset < 3; offset = offset+1)			{				translString = "";				translString * (seqLen/3+1);				for (seqPos = offset; seqPos < seqLen; seqPos = seqPos+3)				{					codon = aSeq[seqPos][seqPos+2];					prot = codonToAAMap[codon];					if (Abs(prot))					{						translString * prot;					}					else					{						translString * "?";					}				} 				translString * 0;				translString = translString^{{"X$","?"}};				stopPos = translString||"X";				if (stopPos[0]>=0)				{					stopCount = Rows(stopPos)$2;					stopPosn[offset][0] = stopPos[0];					stopPosn[offset][1] = stopPos[stopCount*2-1];				}				else				{					stopCount = 0;				}				if (stopCount<minStops)				{					minStops = stopCount;					rFrame = offset;					tString = translString;				}				allTran[offset] = translString;			}			ReadingFrames[seqCounter] 		= rFrame;			ProteinSequences[seqCounter]	= tString;			frameCounter[rFrame] 			= frameCounter[rFrame]+1;			StopPositions[seqCounter]		= stopPosn;			AllTranslations [seqCounter]	= allTran;						if (minStops>0)			{				stillHasStops[Abs(stillHasStops)] = seqCounter;				if (seqCounter == 0)				{					fprintf (stdout, "ERROR:Reference sequence must not contain frameshifts\n");					continue;				}			}		}		s1 = ProteinSequences[0];				if (verboseFlag)		{			fprintf (stdout, "\nFound:\n\t", frameCounter[0], " sequences in reading frame 1\n\t",frameCounter[1], " sequences in reading frame 2\n\t",frameCounter[2], " sequences in reading frame 3\n\nThere were ", Abs(stillHasStops), " sequences with apparent frameshift/sequencing errors\n");		}	}	else	{		ProteinSequences = UnalignedSeqs;		s1 = ProteinSequences[0];	}		skipSeqs = {};		for (k=0; k<Abs(stillHasStops); k=k+1)	{		seqCounter = stillHasStops[k];		GetString (seqName, unal, seqCounter);		if (verboseFlag)		{			fprintf (stdout,"Sequence ", seqCounter+1, " (", seqName, ") seems to have");		}		stopPosn = StopPositions[seqCounter];				fStart = -1;		fEnd   = -1;		fMin   = 1e10;		frame1 = 0;		frame2 = 0;				checkFramePosition (stopPosn[0][1],stopPosn[1][0],0,1);		checkFramePosition (stopPosn[1][1],stopPosn[0][0],1,0);		checkFramePosition (stopPosn[0][1],stopPosn[2][0],0,2);		checkFramePosition (stopPosn[2][1],stopPosn[0][0],2,0);		checkFramePosition (stopPosn[2][1],stopPosn[1][0],2,1);		checkFramePosition (stopPosn[1][1],stopPosn[2][0],1,2);				if (fStart>=0)		{			allTran = AllTranslations[seqCounter];			useq    				   = UnalignedSeqs[seqCounter];			if (verboseFlag)			{				fprintf (stdout, " a shift from frame ", frame2+1, " to frame ", frame1+1, " between a.a. positions ", fStart, " and ", fEnd, ".");			}			fStart2 = Max(fStart-1,0);			fEnd2   = Min(fEnd+1,Min(Abs(allTran[frame1]),Abs(allTran[frame2]))-1);			tempString = allTran[frame2];			if (verboseFlag)			{				fprintf (stdout, "\n\tRegion ", fStart2, "-", fEnd2, " in frame  ", frame2+1, ":\n\t", tempString[fStart2][fEnd2]);				fprintf (stdout, "\n\t", useq[3*fStart2+frame2][3*fEnd2+frame2-1]);			}			tempString = allTran[frame1];			if (verboseFlag)			{				fprintf (stdout, "\n\tRegion ", fStart2, "-", fEnd2, " in frame  ", frame1+1, ":\n\t", tempString[fStart2][fEnd2]);				fprintf (stdout, "\n\t", useq[3*fStart2+frame1][3*fEnd2+frame1-1]);				fprintf (stdout, "\n\t\tAttempting to resolve by alignment to reference. ");			}			f1s = allTran[frame1];			f2s = allTran[frame2];			f1l = Abs(f1s);						bestScore  = -1e10;			bestSplice = -1;						for (k2=fStart; k2<fEnd; k2=k2+1)			{				s2 = f2s[0][k2]+f1s[k2+1][Abs(f1s)];				inStr = {{s1,s2}};				AlignSequences(aligned, inStr, alignOptions);				aligned = aligned[0];				aligned = aligned[0];				if (aligned > bestScore)				{					bestScore = aligned;					bestSplice = k2;					bestString = s2;				}			}			if (verboseFlag)			{				fprintf (stdout, "Best splice site appears to be at a.a. position ", bestSplice, "\n");			}			/* update best spliced string */						ProteinSequences[seqCounter] = bestString;			ReadingFrames[seqCounter]    = 0;						UnalignedSeqs[seqCounter]  = useq[frame2][frame2+3*bestSplice+2] + useq[frame1+3*bestSplice+3][Abs(useq)-1] + "---";		}		else		{			if (!verboseFlag)			{				fprintf (stdout,"ERROR: Sequence ", seqCounter+1, " (", seqName, ") seems to have");			}			fprintf (stdout, " multiple frameshifts\n");			return 1;				skipSeqs[seqCounter] = 1;		}		}		if (Abs(skipSeqs))	{		continue;	}	SeqAlignments 	 = {};	startingPosition = {Columns(UnalignedSeqs),2};	refLength = Abs(ProteinSequences[0]);	refInsertions	 = {refLength,1};		if (verboseFlag)	{		fprintf (stdout,"\nPerforming pairwise alignment with reference sequences\n");	}		seqCounter = 1;	s2 			 = ProteinSequences[seqCounter];	inStr 		 = {{s1,s2}};	AlignSequences(aligned, inStr, alignOptions);	aligned = aligned[0];	SeqAlignments[seqCounter] = aligned;	aligned = aligned[1];	myStartingPosition = aligned$"[^-]";	myEndingPosition  = Abs (aligned)-1;	while (aligned[myEndingPosition]=="-")	{		myEndingPosition = myEndingPosition - 1;	}	myStartingPosition = myStartingPosition[0];	startingPosition[seqCounter][0] = myStartingPosition;	startingPosition[seqCounter][1] = myEndingPosition;	aligned = aligned[myStartingPosition][myEndingPosition];	refInsert = aligned||"-+";	if (refInsert[0]>0)	{		insCount = Rows (refInsert)/2;		offset = 0;		for (insN = 0; insN < insCount; insN = insN+1)		{			insPos 		= refInsert[insN*2];			insLength	= refInsert[insN*2+1]-insPos+1;			insPos 		= insPos-offset;			if (refInsertions[insPos]<insLength)			{				refInsertions[insPos]=insLength;			}			offset = offset + insLength;		}	}		fullRefSeq = "";	fullRefSeq * refLength;	fullRefSeq * (s1[0]);	if (alignmentType == 0)	{		s1N = UnalignedSeqs[0];			fullRefSeqN = "";		fullRefSeqN * (3*refLength);		fullRefSeqN * (s1N[0][2]);			frameShift = ReadingFrames[0];	}	for (seqCounter=1;seqCounter<refLength;seqCounter=seqCounter+1)	{		gapCount = refInsertions[seqCounter];		for (k=0; k<gapCount;k=k+1)		{			fullRefSeq*("-");			if (alignmentType == 0)			{				fullRefSeqN*("---");			}		}			fullRefSeq  * (s1[seqCounter]);		if (alignmentType == 0)		{				fullRefSeqN * (s1N[frameShift+seqCounter*3][frameShift+seqCounter*3+2]);		}	}	fullRefSeq  * 0;	if (alignmentType == 0)	{		fullRefSeqN * 0;	}	seqCounter = 1;	GetString (seqName,unal,seqCounter);	aligned = SeqAlignments[seqCounter];		aligned1 = aligned[1];	aligned2 = aligned[2];		s2 = startingPosition[seqCounter][0];	e2 = startingPosition[seqCounter][1];		gappedSeq = "";	gappedSeq * Abs(aligned2);	k=0;		while (k<refLength)	{		while (fullRefSeq[k]!=aligned1[s2])		{			gappedSeq*("-");			k=k+1;		}		gappedSeq*(aligned2[s2]);		s2=s2+1;		k=k+1;	}	gappedSeq * 0;		if (alignmentType == 0)	{			gappedSeqN = "";		gappedSeqN * (3*Abs(aligned2));				frameShift = ReadingFrames[seqCounter];			s1N 	= UnalignedSeqs[seqCounter];		s2N		= ProteinSequences[seqCounter];		s2 		= startingPosition[seqCounter][0];		k 		= 0;		e2		= Abs(gappedSeq);		k = 0;		while  (k<e2)		{			while ((s2N[s2]!=gappedSeq[k])&&(k<e2))			{				gappedSeqN * ("---");				k=k+1;			}			if (k<e2)			{				gappedSeqN * s1N[frameShift+s2*3][frameShift+s2*3+2];				s2 = s2+1;				k=k+1;			}		}		gappedSeqN * 0;			}	else	{		gappedSeqN = gappedSeq;	}		regExpS = gappedSeqN $ "^\\-+";	if (regExpS[0]>=0 && KEEP_ALL_GAPS_IN == 0)	{		if (alignmentType)		{			startFrom 		= (regExpS		[1]+1);				}		else		{			startFrom 		= (regExpS		[1]+1)$3;		}	}	else	{		startFrom = 0;	}	regExpE	= gappedSeqN $ "\\-+$";	if (alignmentType)	{		if (regExpE[0]>=0 && KEEP_ALL_GAPS_IN == 0)		{			endAt		= regExpE[0];		}		else		{			endAt		= Abs (gappedSeqN);		}		}	else	{		if (regExpE[0]>=0 && KEEP_ALL_GAPS_IN == 0)		{			endAt		= regExpE[0]$3;		}		else		{			endAt		= Abs (gappedSeqN)$3;		}	}	outSeqs = {};	for (k=0; k< ref_ds.species-1; k=k+1)	{		outSeqs[k] = "";		outSeqs[k] * 128;			}		shift = 0;	if (alignmentType == 0)	{		gapStringInsert = "---";	}	else	{		gapStringInsert = "-";		}	for (s=startFrom; s<endAt; s=s+1)	{		if (fullRefSeq[s] == "-")		{			shift = shift+1;			for (k=0; k< ref_ds.species-1; k=k+1)			{				outSeqs[k] * gapStringInsert;					}		}		else		{			/* only insert reference characters if 			   the query DOES NOT have indels in 			   that position */			   			if (alignmentType)			{				if (gappedSeqN[s] != "-" || KEEP_ALL_GAPS_IN == 1)				{					idx = (s-shift);					for (k=0; k< ref_ds.species-1; k=k+1)					{						outSeqs[k] * (refSeqs[k])[idx];							}				}			}			else			{				if (gappedSeqN[3*s] != "-" || KEEP_ALL_GAPS_IN == 1)				{					idx = 3*(s-shift);					for (k=0; k< ref_ds.species-1; k=k+1)					{						outSeqs[k] * (refSeqs[k])[idx][idx+2];							}				}			}		}	}	for (k=0; k< ref_ds.species-1; k=k+1)	{		outSeqs[k] * 0;			}	outputAlignment * 256;	for (k=0; k< ref_ds.species-1; k=k+1)	{		GetString (refName, ref_ds,k);		outputAlignment *( ">"+ refName+ "\n"+ outSeqs[k]+ "\n");	}			if (KEEP_ALL_GAPS_IN == 1)	{		alignedQuerySeq = gappedSeqN;				if (alignmentType == 0)		{			outputAlignment * (">" + qryName + "\n" + alignedQuerySeq[3*startFrom][3*endAt-1] + "\n" + refTree + "\n");		}		else		{			outputAlignment * (">" + qryName + "\n" + alignedQuerySeq[startFrom][endAt-1] + "\n" + refTree + "\n");			}	}	else	{				alignedQuerySeq = gappedSeqN ^ {{"\\-"}{""}};		if (alignmentType == 0)		{			outputAlignment * (">" + qryName + "\n" + alignedQuerySeq + "\n" + refTree + "\n");		}		else		{			outputAlignment * (">" + qryName + "\n" + alignedQuerySeq + "\n" + refTree + "\n");			}	}		outputAlignment * 0;}function checkFramePosition (pos1, pos2, fr1, fr2){	fSpan  = pos2-pos1;		if (fSpan>1) /* first followed by second*/	{		if (fSpan < fMin)		{			fMin = fSpan;			frame1 = fr1;			frame2 = fr2;			fStart = pos1+1;			fEnd   = pos2;		}	}		return 0;}