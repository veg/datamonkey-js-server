ExecuteAFile ("../Shared/GrabBag.bf");
ExecuteAFile ("ESD_functions.ibf");


rm = extractRateDistributions ("");
lfFit 		= LAST_FILE_PATH;




/*
ExecuteAFile ("../Shared/GrabBag.bf");
lfFit		= "/home/datamonkey/Datamonkey/Analyses/EVF/spool/upload.58080847405112.1.fit.1.2.3";
rm = extractRateDistributions (lfFit);
*/

_myRC		= Rows(rm);

ClearConstraints (NS_0);

lhcInput = _makeLHCSamplerInput (lfFit, Rows(rm), 5000*_myRC, 1000, 1.5);
fprintf (progressFilePath, "<DIV CLASS = 'RepClassSM'>Generating a posterior sample of the rate distribution by Latin Hypercube Sampling Importance Resampling</DIV>");
ExecuteAFile ("post_sampler.bf", lhcInput);

returnedSamples  = Rows(_resamplerReturn["VALUES"]);
_nameToColumnMap = {};


for (_k3 = 0; _k3 < Abs(_resamplerReturn["LABELS"]); _k3 = _k3+1)
{
	_nameToColumnMap[(_resamplerReturn["LABELS"])[_k3]] = _k3;
}

fileOut = lfFit + ".samples";


/*
fprintf (stdout,"Writing samples to ", fileOut, "\n");
*/

allSamples = {};
allSites   = Rows((_resamplerReturn["POSTERIORS"])[0]);

allPosteriors = {allSites,returnedSamples};

for (_k3 = 0; _k3 < returnedSamples; _k3 = _k3+1)
{	
	/* populate UNSCALED (ALPHA,BETA,P) */
	
	_postResample = (_resamplerReturn["POSTERIORS"])[_k3];
	for (_k4 = 0; _k4 < allSites; _k4 = _k4 + 1)
	{
		allPosteriors[_k4][_k3] = _postResample [_k4];	
	}
	
	if (_myRC > 1)
	{
		unscaledRates 			= {_myRC,3};
		unscaledRates [0][0] 	= (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["S_0"]];
		unscaledRates [0][1] 	= (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["NS_0"]];
		unscaledRates [0][2] 	= (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["P_1"]];
		 
		_scalingFactor 			= unscaledRates[0][0]*unscaledRates [0][2];
		_currentProb			= 1-unscaledRates [0][2];
		
		for (_k4 = 1; _k4 < _myRC; _k4 = _k4+1)
		{
			unscaledRates [_k4][0] 	= (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["S_"+_k4]];
			unscaledRates [_k4][1] 	= (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["NS_"+_k4]];
			if (_k4 < _myRC - 1)
			{
				unscaledRates [_k4][2] 	= _currentProb * (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["P_"+(1+_k4)]];
				_currentProb			= _currentProb * (1-(_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["P_"+(1+_k4)]]);
			}
			else
			{
				unscaledRates [_k4][2] 	= _currentProb;			
			}
			_scalingFactor 			= _scalingFactor+unscaledRates[_k4][0]*unscaledRates [_k4][2];
		}

	}
	else
	{
		unscaledRates = {1,3};
		unscaledRates [0][0] 	= (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["S_0"]];
		unscaledRates [0][1] 	= (_resamplerReturn["VALUES"])[_k3][_nameToColumnMap["NS_0"]];
		unscaledRates [0][2] 	= 1;
		_scalingFactor			= unscaledRates [0][0];
	}
	
	gbddSample = {_myRC,3};
	
	for (_k4 = 0; _k4 < _myRC; _k4 = _k4+1)
	{
		gbddSample[_k4][0]				= unscaledRates[_k4][0]/_scalingFactor;
		gbddSample[_k4][1]					= unscaledRates[_k4][1]/_scalingFactor;
		gbddSample[_k4][2]					= unscaledRates[_k4][2];
		
	}			 
	allSamples[Abs(allSamples)] = gbddSample;
}

/*fprintf (fileOut, CLEAR_FILE, allSamples);
fileOut = fileOut+".log_scores";
fprintf  (fileOut, CLEAR_FILE, _resamplerReturn["LABELS"],"\n",_resamplerReturn["VALUES"]);*/