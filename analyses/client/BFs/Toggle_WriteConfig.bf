/*takes sites FORM from Toggle_Prep.bf and writes an array of sites to process to file */

RequireVersion  ("0.9920060815");

fscanf	(stdin, "String", _in_FilePath);

_goodSites = {};

siteList = "";
siteList * 128;

while (1)
{
	fscanf	(stdin, "Number", site);
	if (site < 0)
	{
		break;
	}
	_goodSites [site] = 1+Abs(_goodSites);
	if (_goodSites[site] > 1)
	{
		siteList * ",";
	}
	siteList * ("" + site);
}

siteList * 0;

ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");

outFile 						= BASE_CLUSTER_ACCESS_PATH + _in_FilePath + ".toggle.config";
fprintf 						(outFile,CLEAR_FILE, KEEP_OPEN, avlKeysToMatrix (_goodSites) );
fprintf 						(outFile, CLOSE_FILE);
fprintf (stdout, "OK");