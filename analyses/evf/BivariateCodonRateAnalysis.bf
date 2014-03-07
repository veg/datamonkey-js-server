bivariateFitOptions = {};

ExecuteAFile ("MGwAA.ibf");

currentLFSpool = _bivariateFilePath + ".fit.1";
lastLFSpool		 = currentLFSpool;

allBivariateResults = {};

bivariateFitOptions ["00"] = "New run";
bivariateFitOptions ["01"] = "Nucleotide Model";
bivariateFitOptions ["04"] = _bivariateFilePath;

bivariateFitOptions ["07"] = modelDesc;
bivariateFitOptions ["08"] = "Default";
bivariateFitOptions ["09"] = "1";
bivariateFitOptions ["10"] = "Unconstrained";
bivariateFitOptions ["11"] = currentLFSpool;

fprintf				(progressFilePath,CLEAR_FILE,"<DIV class = 'RepClassSM'>Fitting a general bivariate discrete distribution (GBDD) model with one rate class</DIV>" );

ExecuteAFile ( "dNdSBivariateRateAnalysis.bf",
				bivariateFitOptions
			 );
			 
currentCAIC   = bivariateReturnAVL["cAIC"];
bestCAICsoFar = 1e100;
currentRateCount = 1;
bestClassCount = 1;

gateauxOptions = {};
gateauxOptions ["02"] = "-1";

allBivariateResults[Abs(allBivariateResults)] = bivariateReturnAVL;

rateDistributionInfo = reportMx;


while (currentCAIC < bestCAICsoFar)
{
	bestClassCount = currentRateCount;
	gateauxOptions ["01"] = currentLFSpool;
	fprintf				(progressFilePath,"<DIV CLASS = 'RepClassSM'>Current c-AIC = ", currentCAIC, ". Previous model c-AIC = ", bestCAICsoFar, "</DIV>\n");
	bestCAICsoFar = currentCAIC;

	DeleteObject (lf);

	fprintf				(progressFilePath,"<DIV CLASS = 'RepClassSM'>Using Gateaux directional search to seed the model with ",currentRateCount+1, " rates </DIV>\n");
	
	ExecuteAFile ("Gateaux.bf",
				  gateauxOptions
			 	  );

	improved = bivariateReturnAVL ["DIFF"];
	
	if (improved == 0)
	{
		fprintf				(progressFilePath,"<DIV CLASS = 'RepClassSM'>No gateaux improvement. Stopping at ", currentRateCount, " rate classes</DIV>\n");
		break;
	}
	rateDistributionInfo = reportMx;
	lastLFSpool		 = currentLFSpool;
	currentRateCount = currentRateCount + 1;
	currentLFSpool = currentLFSpool + "." + currentRateCount;

	bivariateFitOptions ["00"] = "Continued run";
	bivariateFitOptions ["01"] = currentLFSpool;
	bivariateFitOptions ["02"] = "Unconstrained";

	fprintf				(progressFilePath,"<DIV class = 'RepClassSM'>Fitting a GBDD model with ",currentRateCount," rate classes</DIV>" );

	ExecuteAFile ("dNdSBivariateRateAnalysis.bf",
					bivariateFitOptions
			 	);
			 
	currentCAIC   = bivariateReturnAVL["cAIC"];

}

fprintf				(progressFilePath,"<DIV CLASS = 'RepClassSM'>Current c-AIC = ", currentCAIC, ". Previous model c-AIC = ", bestCAICsoFar, "<p>");
fprintf (progressFilePath, "Best-fitting model has ", bestClassCount, " rates</DIV>\n");






