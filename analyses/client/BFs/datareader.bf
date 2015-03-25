
function ErrorOut (errString)
{
	fprintf (stdout, "ERROR:<DIV class = 'ErrorTagSM'>\n", errString, "\n<p>Puzzled? Take a <a href='",BASE_CGI_URL_STRING,"showdata.pl?",filePath,"'>look</a> at the file which was uploaded and make sure it is what you expected. If all else fails send your file to spond@ucsd.edu and we'll try to determine what the problem is.\n");
	/*match = HYPHY_BASE_DIRECTORY+"Formats/uploadtable";
	fscanf  (match,"Raw",rehash);
	rehash = rehash^{{"BASE_CGI_URL_STRING",BASE_CGI_URL_STRING}};*/
	fprintf (stdout, "</DIV><DIV CLASS = 'RepClassSM'>Back to the <a href = '",BASEL_URL_STRING,"/dataupload.php'>upload</a> page", "\n</DIV>");
	return 0;
}

internalRenames = 0;

/*------------------------------------------------------------------------------------*/

function removeNodeFromParent (nodeID)
{
	parentID 		= (tAVL[nodeID])["Parent"];
	childrenCount 	= Abs ((tAVL[parentID])["Children"]);
	(tAVL[nodeID])["Parent"] = -1;

	for (k2 = 0; k2 < childrenCount; k2 = k2+1)
	{
		if (((tAVL[parentID])["Children"])[k2] == nodeID)
		{
			break;
		}
	}
	for (; k2 < childrenCount - 1; k2=k2+1)
	{
		((tAVL[parentID])["Children"])[k2] = ((tAVL[parentID])["Children"])[k2+1];
	}
	
	(tAVL[parentID])["Children"] - (childrenCount-1);
	childrenCount = childrenCount-1;
	
	if (childrenCount == 1)
	{
		nodeID 			= (tAVL[parentID])["Parent"];
		childrenCount 	= Abs ((tAVL[nodeID])["Children"]);
		remainingChild 	= ((tAVL[parentID])["Children"])[0];
		
		for (k2 = 0; k2 < childrenCount; k2 = k2+1)
		{
			if (((tAVL[nodeID])["Children"])[k2] == parentID)
			{
				((tAVL[nodeID])["Children"])[k2] 	= remainingChild;
				(tAVL[parentID])["Parent"] 			= -1;
				(tAVL[remainingChild])["Parent"] 	= nodeID;
				(tAVL[remainingChild])["Depth"] 	= (tAVL[nodeID])["Depth"] + 1;
				break;
			}
		}
	}
		
	return 0;
}

/*------------------------------------------------------------------------------------*/

function checkTreeString (treeS, treeID)
{
    if (treeID == 1) {
        fprintf (stdout, "<H1 class='SuccessCap'>Successful file upload</H1><DIV class = 'RepClassSM'>Read <b>",filteredData.species,"</b> sequences and <b>",filteredData.sites,"</b> ",dType," alignment columns and <b>",_pCount,"</b> partitions.");
        if (genCodeID >= 0)
        {
            fprintf (stdout, "<p>Aminoacid translation in <a href='",BASE_CGI_URL_STRING,"showdata.pl?",filePath,".aa' target = '_blank'>[FASTA]</a><a href='",BASE_CGI_URL_STRING,"seqPlot.pl?file=",filePath,".aa' target = '_blank'>[PDF]</a>.</DIV>");
        }
        else
        {
            fprintf (stdout, "</DIV>");
        }   
    }
	if (Abs(treeS))
	{
		Topology t 	= treeS;
		leafCount 	= TipCount (t) - Abs (removedSequences);
		
		internalLabels = {};
		
		if (filteredData.species == leafCount)
		{
			tAVL         = t ^ 0;
			
			for (k=1; k<Abs(tAVL);k=k+1)
			{
				seqName = (tAVL[k])["Name"] && 1;
				if (Type (((tAVL[k])["Children"])) != "AssociativeList")
				{
					if (removedSequences[seqName])
					{
						removeNodeFromParent (k);
					}
					else
					{
						p = seqNamesMap[seqName];
						if (Abs(p)==0)
						{
							fprintf (stdout, "<DIV class = 'WarnClassSM'>A tree (#",treeID,") was included in the data file, but leaf <b>",seqName,"</b> had no matching sequence (or was a duplicate) in the data.</DIV>");
							seqNamesList - seqName;
							break;
						}
						else
						{
							(tAVL[k])["Name"] = seqNamesMap[seqName];
						}
					}
				}
				else
				{
					(tAVL[k])["Name"] = normalizeSequenceID (seqName,"internalLabels");
					if (internalRenames == 0)
					{
						internalRenames = (seqName!=(tAVL[k])["Name"]);
					}
				}
				(tAVL[k])["Length"] = -1;
			}
			
			
			if (k == Abs(tAVL))
			{
				fprintf (stdout, "<DIV class = 'RepClassSM'>A well defined tree (#",treeID,") was included in the data file, and all leaves were successfully matched to sequence names in the alignment.</DIV>");
				if (renames || internalRenames || Abs(removedSequences))
				{	
					if (Abs(removedSequences))
					{
							treeSize = Abs(tAVL);
							for (nodeIndex = treeSize-1; nodeIndex>0; nodeIndex = nodeIndex - 1)
							{
								if (nodeIndex < treeSize && (tAVL[nodeIndex])["Parent"] < 0)
								{
									continue;
								}
							
								
								_cc		 = Abs((tAVL[nodeIndex])["Children"]);
								if (_cc > 0)
								{
									_cd = (tAVL[nodeIndex])["Depth"] + 1;
									for (_cci = 0; _cci < _cc; _cci = _cci+1)
									{				
										_cn =  ((tAVL[nodeIndex])["Children"])[_cci];
										(tAVL[_cn])["Depth"] = _cd;
									}
								}
							}				
					}
				
					doneTree = 	PostOrderAVL2String(tAVL);
					/*fprintf ("/Library/Webserver/uploads/tree.dump",CLEAR_FILE,tAVL, doneTree);*/
					
					return doneTree;
				}
				else
				{
					return  treeS;
				}
				
			}
		}
		else
		{
			fprintf (stdout, "<DIV class = 'WarnClassSM'>A tree (#",treeID,") was found in the data file, but the number of leaves (",leafCount,") did not match the number of sequences in the file.</DIV>");
		}
	}
	return "";
}

/*------------------------------------------------------------------------------------*/

fscanf (stdin,"String", fileName);
fscanf (stdin,"Number", genCodeID);

skipCodeSelectionStep = 1;
ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/chooseGeneticCode.def");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/TreeTools.ibf");
ExecuteAFile	("../Shared/NJ.bf");


/* first check for MEGA headers */

fscanf (fileName, "String", testForMega);
if (testForMega == "#mega")
{
	fscanf (fileName, "Lines", testForMega);
	fprintf (fileName, CLEAR_FILE, KEEP_OPEN);
	for (k=0; k<Columns(testForMega); k=k+1)
	{
		if ((testForMega[k])[0] != "!")	
		{
			fprintf (fileName, testForMega[k], "\n");	
		}
	}
	fprintf (fileName, CLOSE_FILE);
	
}

if (genCodeID >= 0)
{
	ApplyGeneticCodeTable (genCodeID);
}

DataSet 			ds 	=  ReadDataFile (fileName);

fileDirInfo = splitOnRegExp(fileName,"/");
filePath    = fileDirInfo[Abs(fileDirInfo)-1];
	


if (ds.sites < 3)
{
	 ErrorOut("This doesn't seem to be a valid alignment file. Please refer to the list of file <a href='http://www.hyphy.org/docs/shared/dataformats.html' target = '_blank'>formats</a> that HyPhy supports."+
					 "Also make sure that you are uploading a <b>plain-text</b> file and not an RTF, Micro$oft Word, etc document. Also, some browsers with poor standard compliance (such as Microsoft Explorer) can add garbage characters to the beginning and the end of uploaded files."+
					 "Please make sure the file has a .txt extension and is saved as plain text if you are using a Microsoft browser.");
	return 0;
}

HarvestFrequencies (freqs, ds, 1,1,1);

if (genCodeID != (-2)) /* not an AA alignment */
{
	if (Rows(freqs) != 4)
	{
		ErrorOut("This doesn't seem to be a nucelotide alignment. It had <div class = 'RepClassSM'>"+Rows(freqs)+"</div>character states, whereas we expected 4. Perhaps you uploaded an amino-acid alignment by mistake?");
		return 0;
	}
}
else
{
	if (Rows(freqs) != 20)
	{
		 ErrorOut("This doesn't seem to be a protein alignment. It had <div class = 'RepClassSM'>"+Rows(freqs)+"</div>character states, whereas we expected 20. Perhaps you uploaded a nucleotide alignment by mistake?");
		return 0;
	}
}

if (ds.sites%3 && genCodeID >= 0)
{
	 ErrorOut ("The number of nucleotide columns in the data set must be divisible by 3 - had "+ds.sites+
					  " sites. Please check that the reading frame is aligned with the beginning of the data set, and that no trailing sites are extraneous");
	 return 0;
}

if (genCodeID >= 0)
{
	DataSetFilter		filteredData = CreateFilter (ds,3,"","",GeneticCodeExclusions);
	if (!filteredData.sites)
	{
		ErrorOut("Only stop codons were found in your alignment.");
		return 0;
	}
}
else
{
	DataSetFilter		filteredData = CreateFilter (ds,1);
}

GetString 	  (sequenceNames, filteredData, -1);

terminalCodonsStripped = 0;

if (genCodeID >= 0 && filteredData.sites*3 < ds.sites)
{
	DataSetFilter	    	all64 = CreateFilter (ds, 3);

	stopCodonTemplate    = {1,64}["_Genetic_Code[_MATRIX_ELEMENT_COLUMN_]==10"];
	nonstopCodonTemplate = {1,64}["1"]-stopCodonTemplate;

	stopCodonIndex	    = {};

	for (stateCount=0; stateCount<64; stateCount=stateCount+1)
	{
		if (_Genetic_Code[stateCount] == 10)
		{
			stopCodonIndex [Abs(stopCodonIndex)] = stateCount;
		}
	}

	GetInformation (sequenceData, all64);
	GetDataInfo    (duplicateMapper, all64);

	doSomething 	  = 0;
	reportString	  = "";
	
	reportString*512;
	reportString*"<table border = '0'><tr class='HeaderClassSM'><td>Sequence Name</td><td>Position (in nucleotides)</td><td>Codon found</td></tr>";

	nucLetters 		  		= "ACGT";
	totalStopCodonsFound 	= 0;
	classID					= 0;
	
	stopsPerSite			= {};

	for (sequenceIndex = 0; sequenceIndex < all64.species; sequenceIndex = sequenceIndex+1)
	{		
		for (siteIndex = 0; siteIndex < all64.sites; siteIndex = siteIndex+1)
		{
			sI 			= duplicateMapper[siteIndex];
			GetDataInfo (siteInfo, all64, sequenceIndex, sI);
			if ((stopCodonTemplate*siteInfo)[0]>0 && (nonstopCodonTemplate*siteInfo)[0]==0)
			{	
				stopsPerSite [siteIndex] = stopsPerSite [siteIndex] + 1;
				
				if (classID == 0)
				{
					reportString*("<tr class = 'TRReport1'><td>"+sequenceNames[sequenceIndex]+"</td><td>"+(3*siteIndex+1)+"</td><td>");
				}
				else
				{
					reportString*("<tr class = 'TRReport2'><td>"+sequenceNames[sequenceIndex]+"</td><td>"+(3*siteIndex+1)+"</td><td>");				
				}
				classID = !classID;
				for (z=0; z<Abs(stopCodonIndex); z=z+1)
				{
					siteInfo2 = stopCodonIndex[z];
					if (siteInfo[siteInfo2] > 0)
					{
						reportString*(nucLetters[siteInfo2$16]+nucLetters[siteInfo2%16$4]+nucLetters[siteInfo2%4]);
						break;
					}
				}
				totalStopCodonsFound = totalStopCodonsFound + 1;
				reportString*("</td></tr>");
			}
		}
	}

	reportString*("</table>");
	reportString*0;
	
	if (stopsPerSite[all64.sites-1] == all64.species && Abs (stopsPerSite) == 1)
	{
		terminalCodonsStripped = 1;
	}
	else
	{
		ErrorOut (""+totalStopCodonsFound+" stop codons found (detailed report below). Please double-check your alignment and ensure that only coding data are present and that the correct genetic code is selected.<p>"+reportString);
		return 0;
	}
}

if (filteredData.species > maxUploadSize || filteredData.sites > maxDMSites)
{
	ErrorOut ("Your data set is too large ("+filteredData.species+" species and "+filteredData.sites+" sites). We currently reject files with more than " + maxSLACSize + " sequences or " + maxDMSites + " sites. "+
			  "We'll increase the numbers when we acquire better dedicated hardware. Alternatively, you can download <a href='http://www.hyphy.org/downloads/'>HyPhy</a> and selection analyses locally (see <a href='http://www.hyphy.org/pubs/hyphybook2007.pdf'>[this document]</a> for details).");
	return 0;
}


seqNamesList 	  = {};
seqNamesMap		  = {};
alreadyDefinedSeq = {};
seqMap			  = {};

DuplicateSequenceWarning = "";
DuplicateSequenceWarning * 256;

renameSequenceWarning 	 = "";
renameSequenceWarning	 * 256;

dupSeqCount      = 0;
renames		     = 0;
padWarning       = 0;
removedSequences = {};

for (k=0; k<filteredData.species;k=k+1)
{
	newSeqName = normalizeSequenceID (sequenceNames[k],"seqNamesList");
	if (newSeqName != sequenceNames[k])
	{
		renameSequenceWarning * ("<DT class = 'DT1'>" + sequenceNames[k] + "&rarr;" + newSeqName);
		renames	= renames+1;
		SetParameter (ds,k,newSeqName);
	}	
	seqNamesMap[sequenceNames[k]&&1] = newSeqName;
	GetDataInfo (thisSeqData, filteredData, k);
	
	z = alreadyDefinedSeq[thisSeqData];
	
	if (z)
	{
		seqMap[k] = z-1;
		dupSeqCount = dupSeqCount + 1;
		DuplicateSequenceWarning * ("<DT class = 'DT2'>" + sequenceNames[k] + " = " + sequenceNames[z-1]);
		removedSequences[sequenceNames[k]&&1] = 1;
	}
	else
	{
		alreadyDefinedSeq[thisSeqData] = k+1;
		seqMap [k] = k;
		if ((thisSeqData$"\\?+$")[0]>=0)
		{
			padWarning = 1;
		}
	}
}

renameSequenceWarning    * 0;
DuplicateSequenceWarning * 0;

_pCount = 1;
if (dupSeqCount || renames)
{
	if (genCodeID >= 0)
	{
		DataSetFilter		filteredData 	= CreateFilter (ds,3,"",seqMap[speciesIndex]==speciesIndex,GeneticCodeExclusions);
	}
	else
	{
		DataSetFilter		filteredData 	= CreateFilter (ds,1,"",seqMap[speciesIndex]==speciesIndex);	
	}
	GetString 	  (sequenceNames, filteredData, -1);
}
else
{
	if (Rows(NEXUS_FILE_TREE_MATRIX))
	{
		_pCount = Rows(NEXUS_FILE_TREE_MATRIX);
		if ((_pCount == Columns(DATA_FILE_PARTITION_MATRIX) && Columns(DATA_FILE_PARTITION_MATRIX)) && _pCount > 1)
		{
			ExecuteAFile ("../Shared/PartitionReader.ibf");
			for (k=0; k<ds.sites;k=k+1)
			{
				if(filterCoverage[k] != 1)
				{
					ErrorOut("Paritition specification must cover each nucleotide site exactly once. Had coverage of " + filterCoverage[k] + " at nucleotide " + (k+1) + "(" + mySplits + ")");
					return 0;
				}
			}
		}
	}
}

if (filteredData.species < 3)
{
	ErrorOut("The alignment must include at least 3 unique sequences for selection methods to work");
	return 0;
}

if (genCodeID >= 0)
{
	dType = "codon";
}
else
{
	if (genCodeID == (-1))
	{
		dType = "nucleotide";
	}
	else
	{
		dType = "aminoacid";
	}
}

goodTree = Abs (DATAFILE_TREE);

if (_pCount == 1)
{
	DATAFILE_TREE = checkTreeString (DATAFILE_TREE,1);
	goodTree	  = goodTree && Abs (DATAFILE_TREE);
}
else
{
	for (_k2 = 0; _k2 < _pCount; _k2 = _k2+1)
	{
		myTrees[_k2] = checkTreeString(myTrees[_k2],_k2+1);
		goodTree	  = goodTree && Abs (myTrees[_k2]);
	}
}

buildNJtree = filteredData.species <= maxSLACSize;

if (!goodTree && !buildNJtree) {
    ErrorOut ("Alignments with more than " + maxSLACSize + " sequences must include prebuilt trees");
    return 0;
}

fprintf (stdout, "\n\n");


if (genCodeID != (-2))
{
	fprintf (stdout, "<DIV class = 'RepClassSM'><b>Nucleotide composition</b><DL><DD><b>A&nbsp;</b>",freqs[0]*100,"%<DD><b>C&nbsp;</b>",freqs[1]*100,"%<DD><b>G&nbsp;</b>",freqs[2]*100,"%<DD><b>T&nbsp;</b>",freqs[3]*100,"%</DL></DIV>");
}
else
{
	fprintf (stdout, "<DIV class = 'RepClassSM'><b>Amino-acid composition</b><p><TABLE>");
	GetDataInfo (charInfo, filteredData, "CHARACTERS");
	mx = Max (freqs,0);
	k3 = 0;
	for (k=0; k<4; k=k+1)
	{
		fprintf (stdout, "<TR CLASS = 'ModelClass1'>");
		for (k2=0; k2<5; k2=k2+1)
		{
			rgbColor = (256*(1-freqs[k3]/mx))$1;
			fprintf (stdout,"<TD>",charInfo[k3],"</TD><TD style='background-color:RGB(255,",rgbColor,",",rgbColor,");'>",Format(freqs[k3]*100,5,2),"</TD>");
			k3 = k3+1;
		}
		fprintf (stdout, "</TR>\n");
	}
	fprintf (stdout, "</TABLE></DIV>");
}

if (_pCount > 1)
{
	fprintf (stdout, "<DIV class = 'RepClassSM'><b>Partition specifications</b><DL>");
	for (k=0; k<_pCount;k=k+1)
	{
		fprintf (stdout, "<DD>",k+1,"&nbsp;",mySplits[k]);
	}
	fprintf (stdout, "</DL></DIV>");
}

if (Abs(DuplicateSequenceWarning))
{
	fprintf (stdout, "<DIV class = 'ErrorTagSM'><b>",dupSeqCount,"</b> duplicate sequences found and removed. You can  <a href='",BASE_CGI_URL_STRING,"showdata.pl?",filePath,"'>look</a> at the reduced alignment in NEXUS format for reference.<DL>",DuplicateSequenceWarning,"</DIV>");
}

if (terminalCodonsStripped)
{
	fprintf (stdout, "<DIV class = 'ErrorTagSM'>Trailing stop codons were stripped (this only happens when every sequence in the file has a stop codon at the 3' end and nowhere else).</DIV>");

}

if (Abs(renameSequenceWarning))
{
	fprintf (stdout, "<DIV class = 'ErrorTagSM'><b>",renames,"</b> sequences were renamed to conform to HyPhy standards. You can  <a href='",BASE_CGI_URL_STRING,"showdata.pl?",filePath,"'>look</a> at the renamed alignment in NEXUS format for reference.<DL>",renameSequenceWarning,"</DIV>");
}

if (padWarning)
{
	fprintf (stdout, "<DIV class='ErrorTagSM'>It appears that some of the sequences were of unequal length and were padded by HyPhy. This could be because unaligned sequences were uploaded or non-standard characters were used to mark gaps ('-' and '?' are allowed; but '~' (BioEdit) and '_' for example, are not)."+
					 "<b>Always use</b> the standard IUPAC-IUB <a href='http://en.wikipedia.org/wiki/Nucleic_acid_notation#IUPAC_notation'>character table</a> to prepare the alignment for DataMonkey.org.</DIV>");
}

/* convert to AA */

codonToAAMap = {};
codeToAA 	 = "FLIMVSPTAYXHQNKDECWRG";

nucChars = "ACGT";

if (genCodeID >= 0)
{
	for (p1=0; p1<64; p1=p1+1)
	{
		codon = nucChars[p1$16]+nucChars[p1%16$4]+nucChars[p1%4];
		ccode = _Genetic_Code[p1];
		codonToAAMap[codon] = codeToAA[ccode];
	}
}

if (genCode >= 0)
{
	DataSetFilter  nucData 	= CreateFilter	(filteredData,1);
	GetInformation (theSequences,nucData);

	outSequences = "";
	outSequences *  (nucData.sites* nucData.species);

	for (seqCounter = 0; seqCounter < nucData.species; seqCounter = seqCounter+1)
	{
		aSeq = theSequences[seqCounter];
		seqLen = Abs(aSeq)-2;
		GetString (seqName, nucData, seqCounter);
		translString = "";
		translString * (seqLen/3+1);
		for (seqPos = 0; seqPos < seqLen; seqPos = seqPos+3)
		{
			codon = aSeq[seqPos][seqPos+2];
			prot = codonToAAMap[codon];
			if (Abs(prot))
			{
				translString * prot;
			}
			else
			{
				translString * "?";
			}
		} 
		translString * 0;
		outSequences * (">" + seqName + "\n" + translString + "\n");
	}

	outSequences * 0;
	aaName = fileName+".aa";
	fprintf (aaName, CLEAR_FILE, outSequences);
}

ExecuteAFile	("../Shared/GrabBag.bf");




fprintf (stdout,"<FORM method='GET' action='",BASE_CGI_URL_STRING,"runBlast.pl' target = '_blank'><DIV class = 'RepClassSM'>\n",
				 "BLAST your sequences? <SELECT NAME='seqNumber'>");
				 
				
for (k=0; k<filteredData.species;k=k+1)
{
	fprintf (stdout, "<OPTION VALUE = '",k,"'>", sequenceNames[k], "\n");
}

fprintf (stdout,"</SELECT>\n<INPUT NAME='fileName' VALUE='",filePath, "' TYPE = 'hidden'><INPUT NAME='genCode' VALUE='",genCodeID, "' TYPE = 'hidden'><input type='Submit' value='BLAST Away'></DIV></FORM>");

filePathInfo = splitFilePath (fileName);
jobID		 = filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"];
fprintf (stdout, _makeJobIDHTML (jobID));

fprintf (stdout,"<FORM method='POST' enctype='multipart/form-data' action='",BASE_CGI_URL_STRING,"finishUpload.pl'>\n<DIV style = 'margin:10px; text-align:center;'>");
fprintf (stdout,"<input type='Hidden' name='filename' value='",filePath,"'><input type='Hidden' name='genCodeID' value='",genCodeID,"'>\n<input type='Submit' value='Proceed to the analysis menu' style = 'background-color:purple; color:white; font-size:18px;'> <!--<a href='http://www.datamonkey.org/help/tree.php' target = '_blank' class = 'INFO'>Help</a>--> </DIV></FORM>");

ExecuteAFile("../Shared/DBTools.ibf");

slacDBID = _openCacheDB      (jobID);


fileInformation 						 = {};
fileInformation ["Partitions"] 		 = "INTEGER";
fileInformation ["Sites"] 			 = "INTEGER";
fileInformation ["RawSites"] 		 = "INTEGER";
fileInformation ["Sequences"] 		 = "INTEGER";
fileInformation ["genCodeID"] 		 = "INTEGER";
fileInformation ["Timestamp"] 		 = "REAL";
fileInformation ["GoodTree"] 		 = "INTEGER";
fileInformation ["NJ"] 		 		 = "TEXT";

_CheckDBID (slacDBID,"FILE_INFO",fileInformation);


if (dupSeqCount || renames || internalRenames || terminalCodonsStripped)
{
    DATA_FILE_PRINT_FORMAT          = 6;
    fprintf                                         (fileName,CLEAR_FILE,filteredData);
	DataSet	            ds = ReadDataFile (fileName);
}


record = {};
record ["Partitions"] = _pCount;record ["genCodeID"] = genCodeID;record ["Sites"] = filteredData.sites;

DataSetFilter		filteredData = CreateFilter (ds,1);

if (buildNJtree) {
    InferTreeTopology(1.0);
    treeString 		= TreeMatrix2TreeString (1);
} else {
    treeString      = "";
}

record ["Sequences"] = filteredData.species;record ["Timestamp"] = Format(Time(1),20,0);
record ["GoodTree"]   = goodTree; record ["NJ"]       = treeString; record ["RawSites"]       = filteredData.sites;


_InsertRecord (slacDBID,"FILE_INFO", record);

sequenceNames 					 = {};
sequenceNames ["SeqIndex"] 		 = "INTEGER";
sequenceNames ["Name"] 		     = "TEXT";

_CheckDBID (slacDBID,"SEQUENCES",sequenceNames);

GetString (seqNames, filteredData, -1);
for (k = 0; k < Columns (seqNames); k = k+1)
{
	record = {};
	record["SeqIndex"] = k;
	record["Name"]  = seqNames[k];
	_InsertRecord (slacDBID,"SEQUENCES", record);	
}


fileInformation 						 = {};
fileInformation ["Partition"] 		 = "INTEGER";
fileInformation ["StartCodon"] 		 = "INTEGER";
fileInformation ["EndCodon"] 		 = "INTEGER";
fileInformation ["Span"] 		 	 = "INTEGER";
fileInformation ["UserTree"] 		 = "TEXT";


_CheckDBID (slacDBID,"FILE_PARTITION_INFO",fileInformation);

record = {};
if (_pCount == 1)
{
	record ["Partition"] = 1;record["StartCodon"] = 0; record["EndCodon"] = filteredData.sites-1; record["Span"] = filteredData.sites;
	if (goodTree)
	{
		record ["UserTree"] = DATAFILE_TREE;
	}
	_InsertRecord (slacDBID,"FILE_PARTITION_INFO", record);
}
else
{
	for (_k2 = 0; _k2 < _pCount; _k2 = _k2+1)
	{
		record ["Partition"] = _k2+1;record["StartCodon"] = filterCodonBounds[_k2][0]; record["EndCodon"] = filterCodonBounds[_k2][1]; record["Span"] = filterCodonBounds[_k2][1]-filterCodonBounds[_k2][0]+1;
		if (goodTree)
		{
			record ["UserTree"] = myTrees[_k2];
		}
		_InsertRecord (slacDBID,"FILE_PARTITION_INFO", record);
	}
}

_closeCacheDB (slacDBID);


