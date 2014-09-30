fscanf		(stdin, "Number", modelID);
fscanf		(stdin, "Number", runType);

ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");

/* ________________________________________________________________________________________________*/

function ErrorOut (errString)
{
	fprintf (stdout, "ERROR:<DIV class = 'ErrorTagSM'>\n", errString, "\n</DIV>");
	return 0;
}

/* ________________________________________________________________________________________________*/


ExecuteAFile	("../Formats/ProteinModels/modellist.ibf");
modelsFound  	= Abs (modelList);
	
if (modelID == (-1))
{

	fprintf (stdout, "<H1 class = 'SuccessCap'>Aminoacid substitution models supported by Datamonkey.org</H1>");


	for (k = 0; k < Abs (modelList); k=k+1)
	{	
		fprintf (stdout, "<DIV CLASS='RepClassSM'><b>", (modelList[k])["Name"], "</b>",
						 "<DL><DT CLASS = 'DMDT'>Description<DD>", (modelList[k])["Description"],
						 "<DT CLASS = 'DMDT'>Reference<DD>",(modelList[k])["Reference"],"<A HREF = '",(modelList[k])["URL"],"' TARGET = '_blank' CLASS = 'INFO'>[Paper]</a>\n",
						 "<DT CLASS = 'DMDT'>Rate matrix (scaled to one expected substitution/site)<DD>View as <a href = '",BASE_CGI_URL_STRING,"aamodels.pl?model=",k,"'>[PDF]</a> or <a href = '",BASE_CGI_URL_STRING,"aamodels.pl?type=1&amp;model=",k,"'>[CSV]</a>",
						 "<DT CLASS = 'DMDT'>Model frequencies<DD>View as <a href = '",BASE_CGI_URL_STRING,"aamodels.pl?type=2&amp;model=",k,"'>[CSV]</a>",
						 "</DL></DIV>");
	}
}
else
{
	fileIn = "../Formats/ProteinModels/" + (modelList[modelID])["File"];
	fscanf (fileIn, "String,NMatrix,NMatrix",charString,rateM,freqM);
	
	if (runType == 0)
	{
		if (modelID >= 0 && modelID < modelsFound)
		{
			ExecuteAFile("PlotRateMatrix.bf");
			fprintf (stdout, rateMatrixToPS(charString,rateM,(modelList[modelID])["GenCode"],(modelList[modelID])["Name"]));
		}
	}
	else
	{
		if (runType == 1)
		{
			fprintf (stdout, "To/From");
			for (k=0; k<20; k=k+1)
			{
				fprintf (stdout, ",", charString[k]);
			}
			for (k=0; k<20; k=k+1)
			{
				fprintf (stdout, "\n", charString[k]);
				for (k2=0; k2<20; k2=k2+1)
				{
					fprintf (stdout, ",", rateM[k][k2]);
				}
			}
		}
		else
		{
				fprintf (stdout, "Residue,Frequency");
				for (k=0; k<20; k=k+1)
				{
					fprintf (stdout, "\n", charString[k],",", freqM[k]);
				}
			}		
		}
	}
}

