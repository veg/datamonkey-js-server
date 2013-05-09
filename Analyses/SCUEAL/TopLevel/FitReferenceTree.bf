ExecuteCommands			  ("../Configs/settings.ibf");
SetDialogPrompt 		  ("Load a reference file:");
DataSet					  ds = ReadDataFile (PROMPT_FOR_FILE);
filePath					 = LAST_FILE_PATH;
DataSetFilter			  filteredData = CreateFilter (ds,1,"",speciesIndex < ds.species-1);
HarvestFrequencies 		  (nucEFV, filteredData, 1, 1, 1);

referenceTopologyString 	= DATAFILE_TREE;
modelDesc					= "012345";

global AC 				= 1;
global AT 				= 1;
global CG 				= 1;
global CT 				= 1;
global GT 				= 1;


if (rvChoice)
{
	siteRateClasses = Min(8,Max(2,siteRateClasses $ 1));
	
	if (rvChoice == 1)
	{
		gdDefString = "";
		gdDefString * 1024;
		for (mi=1; mi<siteRateClasses; mi=mi+1)
		{
			gdDefString*("global PS_"+mi+" = 1/"+((siteRateClasses+1)-mi)+";\nPS_"+mi+":<1;\n");
		}
		
		gdDefString*("\n\nglobal RS_1 = .3;\nRS_1:<1;RS_1:>0.000000001;\n");

		for (mi=3; mi<=siteRateClasses; mi=mi+1)
		{
			gdDefString*("global RS_"+mi+" = 1.5;"+"\nRS_"+mi+":>1;RS_"+mi+":<100000;\n");
		} 

		rateStrMx    = {siteRateClasses,1};
		rateStrMx[0] = "RS_1";
		rateStrMx[1] = "1";

		for (mi=3; mi<=siteRateClasses; mi=mi+1)
		{
			rateStrMx[mi-1] = rateStrMx[mi-2]+"*RS_"+mi;
		} 	

		freqStrMx    = {siteRateClasses,1};
		freqStrMx[0] = "PS_1";

		for (mi=1; mi<siteRateClasses-1; mi=mi+1)
		{
			freqStrMx[mi] = "";
			for (mi2=1;mi2<=mi;mi2=mi2+1)
			{
				freqStrMx[mi] = freqStrMx[mi]+"(1-PS_"+mi2+")";		
			}
			freqStrMx[mi] = freqStrMx[mi]+"PS_"+(mi+1);	
		}	

		freqStrMx[mi] = "";
		for (mi2=1;mi2<mi;mi2=mi2+1)
		{
			freqStrMx[mi] = freqStrMx[mi]+"(1-PS_"+mi2+")";		
		}
		freqStrMx[mi] = freqStrMx[mi]+"(1-PS_"+mi+")";	


		gdDefString*("\n\nglobal c_scale:="+rateStrMx[0]+"*"+freqStrMx[0]);

		for (mi=1; mi<siteRateClasses; mi=mi+1)
		{
			gdDefString*("+"+rateStrMx[mi]+"*"+freqStrMx[mi]);
		}

		gdDefString*(";\ncategFreqMatrix={{"+freqStrMx[0]);

		for (mi=1; mi<siteRateClasses; mi=mi+1)
		{
			gdDefString*(","+freqStrMx[mi]);
		}

		gdDefString*("}};\ncategRateMatrix={{"+rateStrMx[0]+"/c_scale");

		for (mi=1; mi<siteRateClasses; mi=mi+1)
		{
			gdDefString*(","+rateStrMx[mi]+"/c_scale");
		}

		gdDefString*("}};\n\ncategory c  = ("+siteRateClasses+", categFreqMatrix , MEAN, ,categRateMatrix, 0, 1e25);\n\n");
		gdDefString*0;
		ExecuteCommands (gdDefString);	
	}
	else
	{
		global betaP = 1;
		global betaQ = 1;
		betaP:>0.05;betaP:<85;
		betaQ:>0.05;betaQ:<85;
		category pc = (siteRateClasses-1, EQUAL, MEAN, 
						_x_^(betaP-1)*(1-_x_)^(betaQ-1)/Beta(betaP,betaQ), /* density */
						IBeta(_x_,betaP,betaQ), /*CDF*/
						0, 				   /*left bound*/
						1, 			   /*right bound*/
						IBeta(_x_,betaP+1,betaQ)*betaP/(betaP+betaQ)
					   );
		
		global alpha = .5;
		alpha:>0.01;alpha:<100;
		category c = (siteRateClasses, pc, MEAN, 
						GammaDist(_x_,alpha,alpha), 
						CGammaDist(_x_,alpha,alpha), 
						0 , 
				  	    1e25,
				  	    CGammaDist(_x_,alpha+1,alpha)
				  	 );
			

	}
	
	NucleotideMatrix	 = {{*,c*AC*t,c*t,c*AT*t}
							{c*AC*t,*,c*CG*t,c*CT*t}
							{c*t,c*CG*t,*,c*GT*t}
							{c*AT*t,c*CT*t,c*GT*t,*}};
													
}
else
{
	NucleotideMatrix	 = {{*,AC*t,t,AT*t}{AC*t,*,CG*t,CT*t}{t,CG*t,*,GT*t}{AT*t,CT*t,GT*t,*}};
}

Model nucModel   		= (NucleotideMatrix, nucEFV, 1);

Tree	baselineTree	= referenceTopologyString;
VERBOSITY_LEVEL			= 1;
LikelihoodFunction		baselineLF = (filteredData, baselineTree);
Optimize				(baseRes, baselineLF);

checkForSavedOptions	= filePath + ".params";

GetString (_lfInfo,baselineLF,-1);
saveStr = ""; saveStr * 128;
varList = _lfInfo["Global Independent"];
for (_gb_idx = 0; _gb_idx < Columns (varList); _gb_idx = _gb_idx + 1)
{
	ExecuteCommands ("pv="+varList[_gb_idx]);
	saveStr * (varList[_gb_idx] + "=" + pv + ";");
} 	
varList = _lfInfo["Local Independent"];
for (_gb_idx = 0; _gb_idx < Columns (varList); _gb_idx = _gb_idx + 1)
{
	ExecuteCommands ("pv="+varList[_gb_idx]);
	saveStr * (varList[_gb_idx] + "=" + pv + ";\n");
} 	
saveStr * 0;
fprintf  (checkForSavedOptions, CLEAR_FILE, saveStr);
