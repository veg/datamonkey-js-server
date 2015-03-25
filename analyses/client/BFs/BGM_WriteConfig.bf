RequireVersion  ("0.9920060815");

fscanf	(stdin, "String", _in_FilePath);
fscanf	(stdin, "Number", _in_network_type);
fscanf	(stdin, "Number", _do_ancesta);

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
ExecuteAFile	("../Shared/DBTools.ibf");
slacDBID 		= _openCacheDB      (_in_FilePath);

mapMutations	= _TableExists (slacDBID,"SLAC_MUTATION") + 2*_TableExists (slacDBID,"SUBSTITUTIONS");

if (mapMutations > 0)
{
	_substitutionReport = {};
	_branchMap			= {};

	if (mapMutations > 1)
	{
		DoSQL (DB_ID, "SELECT Branch,Site FROM 'SUBSTITUTIONS' WHERE SITE IN (" + siteList + ")", "return _substitutionReporter(1)");		
	}
	else
	{
		DoSQL (DB_ID, "SELECT Branch,Site,NS FROM 'SLAC_MUTATION' WHERE SITE IN (" + siteList + ")", "return _substitutionReporter(0)");	
	}
	nvar 			  = Abs(_goodSites);
	nobs			  = Abs(_branchMap);
	total			  = Abs(_substitutionReport);
	dataMx 			  = {nobs, nvar};

	for (k=0; k<total; k=k+1)
	{
		k2 = _substitutionReport[k];
		dataMx [k2[0]][k2[1]]  = 1;
	}

}
else
{
	ErrorOut ("Missing mutation map information.");
	return 0;
}

outFile 						= BASE_CLUSTER_ACCESS_PATH + _in_FilePath + ".bgm";
fprintf 						(outFile,CLEAR_FILE, KEEP_OPEN, _in_network_type, "\n", avlKeysToMatrix (_goodSites), "\n", dataMx);
fprintf 						(outFile, CLOSE_FILE);
_closeCacheDB (slacDBID);

fprintf (stdout, "OK");

/*---------------------------------------------*/

function ErrorOut (errString)
{
	fprintf (stdout, "ERROR:<DIV class = 'ErrorTagSM'>\n", errString, "\n<p>Puzzled? Please report this to spond@ucsd.edu (mention the job ID, which is ", _in_FilePath, ") and we'll try to determine what the problem is.</DIV>\n");
	return 0;
}

/*---------------------------------------------*/

function _substitutionReporter (dummy)
{
	if (dummy)
	{
		_mc = dummy;
	}
	else
	{
		_mc = 0+SQL_ROW_DATA[2];
	}
	if (_mc >= 1)
	{
		_b = _branchMap[SQL_ROW_DATA[0]] - 1;
		if (_b < 0)
		{
			_b = Abs (_branchMap);
			_branchMap [SQL_ROW_DATA[0]] = _b + 1;
		}
		_s = _goodSites [0+SQL_ROW_DATA[1]] - 1;
		if (_s < 0)
		{
			return 0;
		}
		_mxv = {{_b__,_s__}};
		_substitutionReport [Abs(_substitutionReport)] = _mxv;
	}
	return 0;
}
