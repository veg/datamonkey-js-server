/*---------------------------------------------------------*/
/* Turn the keys of an AVL into a string for labeling 
   chart rows */
   
function avlToLabels (_gb_anAVL,_gb_prefix,_gb_delim)
{
	_gb_resString = "";
	_gb_keys	  = Rows (_gb_anAVL);
	_gb_count	  = Columns (_gb_keys);
	_gb_resString * 128;
	_gb_resString * _gb_prefix;
	if (Abs(_gb_prefix))
	{
		_gb_resString * _gb_delim;
	}
	if (_gb_count)
	{
		_gb_resString * _gb_keys[0];
	}
	for (_gb_idx = 1; _gb_idx < _gb_count; _gb_idx = _gb_idx + 1)
	{
		_gb_resString * (_gb_delim+_gb_keys[_gb_idx]);
	}
	_gb_resString * 0;
	return _gb_resString;
}

/*---------------------------------------------------------*/
/* Turn the keys of an AVL into a numerical column matrix  */
   
function avlKeysToMatrix (_gb_anAVL)
{
	_gb_keys	  = Rows (_gb_anAVL);
	_gb_count	  = Columns (_gb_keys);
	_gb_resMatrix = {_gb_count,1};

	for (_gb_idx = 0; _gb_idx < _gb_count; _gb_idx = _gb_idx + 1)
	{
		_gb_resMatrix[_gb_idx] = 0+_gb_keys[_gb_idx];
	}
	return _gb_resMatrix;
}

/*---------------------------------------------------------*/
/* Assuming that the AVL is 0..N indexed, produce a 
string with AVL entries separated by _gb_delim */

function avlToString (_gb_anAVL,_gb_delim)
{
	_gb_count	  = Abs (_gb_anAVL);
	_gb_resString = "";
	_gb_resString * 128;
	if (_gb_count)
	{
		_gb_resString * (""+_gb_anAVL[0]);
	}
	for (_gb_idx = 1; _gb_idx < _gb_count; _gb_idx = _gb_idx + 1)
	{
		_gb_resString * (_gb_delim+_gb_anAVL[_gb_idx]);
	}
	_gb_resString * 0;
	return _gb_resString;
}

/*---------------------------------------------------------*/
/* Assuming that the AVL is 0..N indexed, produce a 
row matrix with AVL entries, using _gb_map to map the values 
and _gb_stride to do the conversion */

function avlToRow (_gb_anAVL, _gb_map, _gb_stride)
{
	_gb_count	  = Abs (_gb_anAVL);
	_gb_matrix	  = {1,_gb_count*_gb_stride};
	
	if (_gb_stride>1)
	{
		for (_gb_idx = 0; _gb_idx < _gb_count; _gb_idx = _gb_idx + 1)
		{
			for (_gb_idx2 = 0; _gb_idx2 < _gb_stride; _gb_idx2 = _gb_idx2 + 1)
			{
				_gb_matrix [_gb_idx*_gb_stride+_gb_idx2] = _gb_map[_gb_stride*_gb_anAVL[_gb_idx]+_gb_idx2];
			}
		}
	}	
	else
	{
		for (_gb_idx = 0; _gb_idx < _gb_count; _gb_idx = _gb_idx + 1)
		{
			_gb_matrix [_gb_idx] = _gb_map[_gb_anAVL[_gb_idx]];
		}
	}
	return _gb_matrix;
}

/*---------------------------------------------------------*/
/* Turn the keys of an AVL into a string for labeling 
   chart rows */
   
function splitFilePath (_filePath)
{
	_splitPath = {};
	_split     = _filePath $ ("[^\\"+DIRECTORY_SEPARATOR+"]+$");
	if (_split[0] == 0 && _split[1] == Abs (_filePath)-1) /* no path, all file name */
	{
		_splitPath ["DIRECTORY"] = "";
	}
	else
	{
		_splitPath ["DIRECTORY"] = _filePath[0][_split[0]-1];
		_filePath = _filePath[_split[0]][Abs(_filePath)];
	}

	_split     = _filePath || "\\.";
	if (_split[0] < 0) /* no extension */
	{
		_splitPath ["EXTENSION"] = "";
		_splitPath ["FILENAME"]  = _filePath;
 	}
	else
	{
		_splitPath ["EXTENSION"] = _filePath[_split[Rows(_split)-1]+1][Abs(_filePath)-1];
		_splitPath ["FILENAME"]  = _filePath[0][_split[Rows(_split)-1]-1];
	}
	return _splitPath;
}

/*---------------------------------------------------------*/
/* fix global variables in a LF at their current values */
   
function fixGlobalParameters (_lfName)
{
	ExecuteCommands ("GetString (_lfInfo," + _lfName + ",-1);");
	_lfInfo = _lfInfo["Global Independent"];
	for (_gb_idx = 0; _gb_idx < Columns (_lfInfo); _gb_idx = _gb_idx + 1)
	{
		ExecuteCommands (_lfInfo[_gb_idx] + ":=" + _lfInfo[_gb_idx] + "__;");
	} 	
	return Columns (_lfInfo);
}

/*---------------------------------------------------------*/
/* prompt for global variabless in a LF and fix their values */
   
function promptForGlobalParameters (_lfName)
{
	ExecuteCommands ("GetString (_lfInfo," + _lfName + ",-1);");
	_lfInfo = _lfInfo["Global Independent"];
	for (_gb_idx = 0; _gb_idx < Columns (_lfInfo); _gb_idx = _gb_idx + 1)
	{
		fprintf (stdout, "\nEnter a value for ", _lfInfo[_gb_idx], ":");
		fscanf  (stdin, "Number", _tval);
		ExecuteCommands (_lfInfo[_gb_idx] + ":=" + _tval + ";");
	} 	
	return 0;
}

/*---------------------------------------------------------*/
/* prompt for global variabless in a LF and fix their values */
   
function echoGlobalParameters (_lfName)
{
	ExecuteCommands ("GetString (_lfInfo," + _lfName + ",-1);");
	_lfInfo = _lfInfo["Global Independent"];
	for (_gb_idx = 0; _gb_idx < Columns (_lfInfo); _gb_idx = _gb_idx + 1)
	{
		ExecuteCommands ("_tval = "+_lfInfo[_gb_idx]);
		fprintf (stdout, _lfInfo[_gb_idx], " : ", Format (_tval, 12, 4), "\n");
	} 	
	return 0;
}


/*---------------------------------------------------------*/
/* take a snapshot of global parameters */
   
function stashGlobalParameters (_lfName)
{
	ExecuteCommands ("GetString (_lfInfo," + _lfName + ",-1);");
	_lfInfo = _lfInfo["Global Independent"];
	_paramStash = {};
	for (_gb_idx = 0; _gb_idx < Columns (_lfInfo); _gb_idx = _gb_idx + 1)
	{
		ExecuteCommands ("_paramStash[\""+_lfInfo[_gb_idx]+"\"] :=" + _lfInfo[_gb_idx] + ";");
	} 	
	return _paramStash;
}

/*---------------------------------------------------------*/
/* take a snapshot of global parameters */
   
function stashAllParameters (_lfName)
{
	ExecuteCommands ("GetString (_lfInfo," + _lfName + ",-1);");
	_paramStash = {};
	_lfInfoG = _lfInfo["Global Independent"];
	for (_gb_idx = 0; _gb_idx < Columns (_lfInfoG); _gb_idx = _gb_idx + 1)
	{
		ExecuteCommands ("_paramStash[\""+_lfInfoG[_gb_idx]+"\"] :=" + _lfInfoG[_gb_idx] + ";");
	} 	
	_lfInfoG = _lfInfo["Local Independent"];
	for (_gb_idx = 0; _gb_idx < Columns (_lfInfoG); _gb_idx = _gb_idx + 1)
	{
		ExecuteCommands ("_paramStash[\""+_lfInfoG[_gb_idx]+"\"] :=" + _lfInfoG[_gb_idx] + ";");
	} 	
	return _paramStash;
}

/*---------------------------------------------------------*/
/* define a global parameter if not already defined */
   
function defineIfNeeded (_parName, _parValue)
{
	ExecuteCommands("GetInformation (_gb_idx, \"^`_parName`$\");");
	if (Rows (_gb_idx) == 0)
	{
		ExecuteCommands ("global `_parName`="+_parValue+";");
		return 0;
	}
	return 1;
}

/*---------------------------------------------------------*/
/* restore values of global parameters */
   

function restoreGlobalParameters (_paramStash)
{
	_stashKeys = Rows(_paramStash);
	for (_gb_idx = 0; _gb_idx < Abs (_paramStash); _gb_idx = _gb_idx + 1)
	{
		ExecuteCommands (_stashKeys[_gb_idx] + "=" + _paramStash[_stashKeys[_gb_idx]] + ";");
	} 	
	return 0;
}

/*---------------------------------------------------------*/
/* take a string row/column matrix and turn it into an AVL of 
   the form avl["matrix entry"] = 1 for each matrix entry */
   
function stringMatrixToAVL (_theList&)
{
	_gb_dim = Rows(_theList)*Columns(_theList);
	_gb_ret = {};
	for (_gb_idx = 0; _gb_idx < _gb_dim; _gb_idx = _gb_idx + 1)
	{
		_gb_ret [_theList[_gb_idx]] = _gb_idx+1;
	} 	
	return _gb_ret;
}

/*---------------------------------------------------------*/
/* take an avl indexed by 0..N-1 and convert to a row matrix */
   
function avlToMatrix (_theList&)
{
	_gb_dim = Abs(_theList);
	_gb_ret = {_gb_dim,1};
	for (_gb_idx = 0; _gb_idx < _gb_dim; _gb_idx = _gb_idx + 1)
	{
		_gb_ret [_gb_idx] = _theList[_gb_idx];
	} 	
	return _gb_ret;
}


/*---------------------------------------------------------*/
/* report a string version of an a/b ratio, handling the cases
   of a and/or b = 0 */
   
function _standardizeRatio (_num, _denom)
{
	if (_denom != 0)
	{
		_ratio = _num/_denom;
		if (_ratio < 10000)
		{
			return Format (_ratio,10,4);
		}
	}
	else
	{
		if (_num == 0)
		{
			return " Undefined";
		}
	}
	return "  Infinite";
}

/*---------------------------------------------------------*/
/* copy branch lengths */
   
function _copyBranchLengths (_treeID1, _treeID2, _op, _suffix)
{
	ExecuteCommands ("_gb_dim=BranchName("+_treeID2+",-1);");
	_gb_ret = "";
	_gb_ret * 128;
	
	for (_gb_idx = 0; _gb_idx < Columns(_gb_dim)-1; _gb_idx = _gb_idx + 1)
	{
		_gb_idx2 = _treeID2 + "." + _gb_dim[_gb_idx] + "." + _suffix;
		ExecuteCommands ("_gb_idx2="+_gb_idx2);
		_gb_ret * (_treeID1 + "." + _gb_dim[_gb_idx] + "." +_suffix + ":=" + _op + _gb_idx2 + ";\n");
	} 	
	_gb_ret * 0;
	return _gb_ret;
}


/*---------------------------------------------*/
/* convert a number into a 5 letter string 
   for initializing stdin lists */
/*---------------------------------------------*/
   
function _mapNumberToString (n)
{
	if (n>=10000) {
		return "" + n;
	}
	if (n>=1000) {
		return "0" + n;
	}
	if (n>=100) {
		return "00" + n;
	}
	if (n>=10) {
		return "000" + n;
	}
	return "0000" + n;
}


/*---------------------------------------------*/
/* return HTML code for the datamonkey job ID
/*---------------------------------------------*/
   
function _makeJobIDHTML (fileName)
{
	return "<DIV Class='RepClassSM'><b>Job ID:</b>"+
		   fileName+
		   " <a href='"+
		   BASE_CGI_URL_STRING+
		   "jobStatus.pl?file="+
		   fileName+
		   "'>[get info]</a></DIV>";
		   /*
		   <IMG SRC='http://www.datamonkey.org/images/monkeys.gif' WIDTH='66' HEIGHT='20' BORDER='0' ALT='Integrative Selection' ALIGN='MIDDLE'></DIV>";
		   */
}

/*------------------------------------------------------------------------------------------*/

function _getTreeLink (fileName,mode,reroot)
{
	if (Abs(reroot))
	{
		reroot = "-" + reroot;
	}
	return BASE_CGI_URL_STRING + "wrapHyPhyBF.pl?file=splits&mode=1&arguments=" + fileName + "-" + mode + reroot;
	
}


/*------------------------------------------------------------------------------------------*/

function _getLongModelName (modelDesc)
{
	longShanks = "";
	ExecuteAFile (BASE_CLUSTER_DIR	+ "Analyses/Shared/ProteinModels/modellist.ibf");
	for (k = 0; k < Abs(modelList); k=k+1)
	{
		if (modelDesc == (modelList[k])["File"])
		{
			break;
		}
	}
	if (k == Abs(modelList))
	{
		modelDesc = 0;
	}
	else
	{
		modelDesc = k;
	}
	
	longShanks = (modelList[0+modelDesc])["Name"];
	return longShanks;

}

/*------------------------------------------------------------------------------------------*/

function _generateProteinModelInfo (modelDesc)
{
    _result = {"+F" : 0};
    
	isPF = modelDesc $ "\\+F$";
    if (isPF [0] > 0) {
        modelDesc = modelDesc[0][isPF[0]-1];
        _result ["+F"] = 1;
    }
    _result ["Filepath"] = BASE_CLUSTER_DIR	+ "Analyses/Shared/ProteinModels/" + modelDesc;
    ExecuteAFile (BASE_CLUSTER_DIR	+ "Analyses/Shared/ProteinModels/modellist.ibf");
    for (k = 0; k < Abs(modelList); k += 1) {
        if (modelDesc == (modelList[k])["File"]) {
            break;
        }
    }
    if (k == Abs(modelList)) {
        modelDesc = 0;
    }
    else {
        modelDesc = k;
    }
    
    modelDescString = (modelList[0+modelDesc])["Name"];
    if (_result ["+F"]) {
        modelDescString += " [empirical frequencies]";
    } else {
        modelDescString += " [model frequencies]";    
    }


		
    _result ["Name"] = modelDescString;		
	return _result;
}


function _generateModelName (dataType, modelDesc, rvChoice, modelDescString&)
{
	if (dataType)
	{
		isPF = modelDesc $ "\\+F$";
		if (isPF [0] > 0)
		{
			modelDesc = modelDesc[0][isPF[0]-1];
		}
		ExecuteAFile (BASE_CLUSTER_DIR	+ "Analyses/Shared/ProteinModels/modellist.ibf");
		for (k = 0; k < Abs(modelList); k=k+1)
		{
			if (modelDesc == (modelList[k])["File"])
			{
				break;
			}
		}
		if (k == Abs(modelList))
		{
			modelDesc = 0;
		}
		else
		{
			modelDesc = k;
		}
		
		modelDescString = (modelList[0+modelDesc])["Name"];
		if (protModelFChoice)
		{
			modelDescString = modelDescString + "+F";
		}
	}
	else
	{
		modelDescString = modelDesc;
	}
		
	simpleModelName = 	modelDescString;
		
	if (rvChoice)
	{
		if (rvChoice == 1) 
		{
			modelDescString = modelDescString + " general discrete rate variation (";
		}
		else
		{
			modelDescString = modelDescString + " beta-gamma rate variation (";	
		}
		modelDescString = modelDescString + rateClasses + " rate classes)";
	}
	
	return simpleModelName;
}

/*------------------------------------------------------------------------------------------*/

function _getRawTreeSplits (fileName, mode&, rootOn&)
{
	GetURL                          (analysisSpecRaw, _getTreeLink (fileName,mode,rootOn));
	if (Abs (analysisSpecRaw) == 0)
	{
		mode      = 0;
		rootOn    = "";
		GetURL      (analysisSpecRaw, _getTreeLink (fileName,0,0));
	}
	return analysisSpecRaw;
}

/*------------------------------------------------------------------------------------------*/
	
function _determineBreakpointPlacement ()
{
	bppMap = {};
	for (h=0; h<filteredData.sites; h=h+1)
	{
		filterString 			 = "" + h;
		DataSetFilter siteFilter = CreateFilter (filteredData,1,filterString);
		HarvestFrequencies 		  (f1, siteFilter, 1, 1, 0);
		m1 = 0;
		for (mpiNode=0; (mpiNode < filterDimension) && (m1<=1) ; mpiNode=mpiNode+1)
		{
			if (f1[mpiNode]>0)
			{
				m1=m1+1;
			}
		}	
		if (m1>1)
		{
			bppMap[Abs(bppMap)] = h;
		}
	}
	return bppMap;
}

/*------------------------------------------------------------------------------------------*/
	
function _reportSubstitutionMatrix (treeName, filterName)
{
	ExecuteCommands ("GetDataInfo (characters,`filterName`,\"CHARACTERS\");");
	fprintf 		(outputFilePath,characters,"\n");
	
	ExecuteCommands ("bl = BranchLength  (`treeName`,-1);");
	ExecuteCommands ("bn = BranchName	   (`treeName`,-1);");
	ExecuteCommands ("_size = BranchCount(`treeName`) + TipCount (`treeName`) - 1;");
	
	for (k = _size; k >= 0 ; k = k - 1)
	{
		if (bl[k] > 0 || k == 0)
		{
			c = 1;
			ExecuteCommands ("GetInformation(branchMx,`treeName`." + bn[k] +");");
			if (bl[k])
			{
				normalizer = bl[k];
			}
			else
			{
				normalizer = 1;
			}
			
			fprintf (outputFilePath, branchMx * (1/ normalizer),"\n");
			break;
		}
	}
	
	if (rvChoice)
	{
		GetInformation (cI,c);
		fprintf (outputFilePath, cI);
	}
	
	return 0;
}

/*---------------------------------------------*/
/* return HTML code for the data description blurb
/*---------------------------------------------*/
   
function _formatTimeString (secondCount)
{
	_hours = secondCount $3600;
	if (_hours < 10)
	{
		_timeString = "0"+_hours;
	}
	else
	{
		_timeString = ""+_hours;
	}
	_minutes = (secondCount%3600)$60;
	if (_minutes < 10)
	{
		_timeString = _timeString+":0"+_minutes;
	}
	else
	{
		_timeString = _timeString+":"+_minutes;
	}
	_seconds = (secondCount%60);
	if (_seconds < 10)
	{
		_timeString = _timeString+":0"+_seconds;
	}
	else
	{
		_timeString = _timeString+":"+_seconds;
	}
	return _timeString;
}	

/*---------------------------------------------
reverse complement a nucleotide string
---------------------------------------------*/

_nucleotide_rc = {};
_nucleotide_rc["A"] = "T";
_nucleotide_rc["C"] = "G";
_nucleotide_rc["G"] = "C";
_nucleotide_rc["T"] = "A";
_nucleotide_rc["M"] = "K";
_nucleotide_rc["R"] = "Y";
_nucleotide_rc["W"] = "W";
_nucleotide_rc["S"] = "S";
_nucleotide_rc["Y"] = "R";
_nucleotide_rc["K"] = "M";
_nucleotide_rc["B"] = "V";  /* not A */
_nucleotide_rc["D"] = "H";  /* not C */
_nucleotide_rc["H"] = "D";  /* not G */
_nucleotide_rc["V"] = "B";  /* not T */
_nucleotide_rc["N"] = "N";

function nucleotideReverseComplement (seqIn)
{
	_seqOut = "";_seqOut*128;
	_seqL   = Abs(seqIn);
	for (_r = _seqL-1; _r >=0 ; _r = _r-1)
	{
		_seqOut *_nucleotide_rc[seqIn[_r]];
	}
	_seqOut*0;
	return _seqOut;
}

/*---------------------------------------------------------------------*/

function mapSets (sourceList,targetList)
// source ID -> target ID (-1 means no correspondence)

{
	targetIndexing = {};
	_d = Rows (targetList) * Columns (targetList);
	
	for (_i = 0; _i < _d; _i += 1)
	{
		targetIndexing [targetList[_i]] = _i + 1;
	}
	_d = Rows (sourceList) * Columns (sourceList);
	mapping 	  = {1,_d};
	for (_i = 0; _i < _d; _i += 1)
	{
		mapping [_i] = targetIndexing[sourceList[_i]] - 1;
	}
	
	return mapping;
}

/*---------------------------------------------------------*/
/* unconstrain global variables in a LF at their current values */
   
function unconstrainGlobalParameters (_lfName) {
	GetString (_lfInfo,^_lfName,-1);
	_lfInfo = _lfInfo["Global Constrained"];
	for (_gb_idx = 0; _gb_idx < Columns (_lfInfo); _gb_idx += 1) {
		ExecuteCommands (_lfInfo[_gb_idx] + "=" + _lfInfo[_gb_idx]);
	} 	
	return 0;
}

/*---------------------------------------------------------*/
function updateAndWriteStatusJSON (status_info, key1, key2, value, do_print) {
    ((^status_info)[_mapNumberToString(key1)])["Time"] = Time(1);
    (((^status_info)[_mapNumberToString(key1)])["Information"])[_mapNumberToString(key2)] = value;
    if (do_print) {
        fprintf (stdout, CLEAR_FILE, ^status_info, "\n");
    }
    return 0;   
}

/*---------------------------------------------------------*/
function runTimeEstimator (start,total,done) {
    now         = Time(1);
    frac_done   = done/total;
    if (frac_done == 1) {
        return "All " + total + " tasks done. Time elapsed: " + _formatTimeString (now-start);
    }
    return "" + done + "/" + total + " tasks done. Time elapsed: " + _formatTimeString (now-start) + ", projected run time left: " + _formatTimeString ((now-start)*(1-frac_done)/frac_done);
}

