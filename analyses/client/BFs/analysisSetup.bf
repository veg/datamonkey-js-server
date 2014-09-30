ExecuteAFile("../Shared/HyPhyGlobals.ibf");
ExecuteAFile("../Shared/GrabBag.bf");
ExecuteAFile("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/TreeTools.ibf");


fscanf		(stdin,"String", filePrefix);
fscanf		(stdin,"String", jobKind);

 
jobKindMap = {"SLAC":0,
"FEL":1,
"IFEL":2,
"REL":3,
"PARRIS":4,
"GABRANCH":5,
"SPIDERMONKEYBGM":6,
"BSR":9,
"MEME":12,
"FUBAR":13,
"SBP":20,
"GARD":21,
"ASR":22,
"EVF":42,
"CMS":55,
"DEPS":60,
"FADE":61,
"TOGGLE":69,
"PRIME":71};
  
/* ________________________________________________________________________________________________*/

function ErrorOut (errString) {
	fprintf (stdout, "FILE:<DIV class = 'ErrorTagSM'>\n", filePrefix, "\n</DIV>");
	fprintf (stdout, "ERROR:<DIV class = 'ErrorTagSM'>\n", errString, "\n</DIV>");
	return 0;
}

/* ________________________________________________________________________________________________*/


ExecuteAFile	("../Shared/DBTools.ibf");
slacDBID 		 = _openCacheDB      (filePrefix);

jobKind = jobKindMap[jobKind&&1];

generalInfo = _ExecuteSQL  (slacDBID,"SELECT * FROM FILE_INFO");
genCodeID	= 0+(generalInfo[0])["genCodeID"];
modelString = "";

if (jobKind != 9)
{
	if (genCodeID != (-2))
	{
		haveModel   = _TableExists (slacDBID, "SLAC_MODEL");
		if (haveModel)
		{
			modelString = (_ExecuteSQL (slacDBID,"SELECT * FROM SLAC_MODEL"))[0];
			if (Abs(modelString)==5)
			{
				modelString = "0"+modelString;
			}
			modelString = "SetModel('"+ modelString + "');";
		}
	}
	else
	{
		haveModel = _TableExists (slacDBID, "PMODEL_RESULTS");
		if (haveModel)
		{
			gi1 = _ExecuteSQL  (slacDBID,"SELECT MIndex,Freqs,cAIC FROM PMODEL_RESULTS ORDER BY cAIC LIMIT 1 ");
			modelString = "SetNamedModel("+(gi1[0])["MIndex"]+","+(gi1[0])["Freqs"]+");";
		}
	}
}

hasSequenceNames = _TableExists (slacDBID,"SEQUENCES");
dbSeqNames = {};
if (hasSequenceNames)
{
	dbSeqNames = _ExecuteSQL  (slacDBID,"SELECT Name FROM SEQUENCES ORDER BY SEQINDEX");
}

hasTreeMode = {};
for (k = 0; k < 4; k=k+1)
{
	hasTreeMode[k] = Abs(_getTreeDescription(slacDBID,k));
}

_closeCacheDB (slacDBID);

ds.sites   = (3*(genCodeID>=0) + (genCodeID<0))*(0+(generalInfo[0])["Sites"]);
ds.species = 0+(generalInfo[0])["Sequences"];
_pCount	   = 0+(generalInfo[0])["Partitions"];

fprintf (stdout, "<H1 Class='SuccessCap'>Analysis Options</H1>",_makeJobIDHTML(filePrefix));
				  
ExecuteAFile ( "../Formats/propagate");



