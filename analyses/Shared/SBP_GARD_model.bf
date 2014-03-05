/*------------------------------------------------------------------------*/
/* MODEL DEFINITION */
/*------------------------------------------------------------------------*/

if (dataType == 0)
{

	global 					AC = 0.5;
	global				 	AT = AC;
	global 					CG = AC;
	global 					CT = 1.;
	global 					GT = AC;
	
	m = 				 {{*,AC*t,t,AT*t}
						 {AC*t,*,CG*t,CT*t}
						 {t,CG*t,*,GT*t}
						 {AT*t,CT*t,GT*t,*}};
					 
	ModelTitle = ""+modelDesc[0];
				
	rateBiasTerms = {{"AC","1","AT","CG","CT","GT"}};
	paramCount	  = 0;
	
	modelConstraintString = "";
	
	for (customLoopCounter2=1; customLoopCounter2<6; customLoopCounter2=customLoopCounter2+1)
	{
		for (customLoopCounter=0; customLoopCounter<customLoopCounter2; customLoopCounter=customLoopCounter+1)
		{
			if (modelDesc[customLoopCounter2]==modelDesc[customLoopCounter])
			{
				ModelTitle  = ModelTitle+modelDesc[customLoopCounter2];	
				if (rateBiasTerms[customLoopCounter2] == "1")
				{
					modelConstraintString = modelConstraintString + rateBiasTerms[customLoopCounter]+":="+rateBiasTerms[customLoopCounter2]+";";
				}
				else
				{
					modelConstraintString = modelConstraintString + rateBiasTerms[customLoopCounter2]+":="+rateBiasTerms[customLoopCounter]+";";			
				}
				break;
			}
		}
		if (customLoopCounter==customLoopCounter2)
		{
			ModelTitle = ModelTitle+modelDesc[customLoopCounter2];	
		}
	}	
	
	if (Abs(modelConstraintString))
	{
		ExecuteCommands (modelConstraintString);
	}
}

modelType = 0;

if (rvChoice)
{
	modelType = 1;
	rateClasses = rateClasses $ 1;
	if (rateClasses < 2)
	{
		rateClasses = 2;
	}
	else
	{
		if (rateClasses > 8)
		{
			rateClasses = 8;
		}
	}	
	
	if (rvChoice == 1)
	{
		gdDefString = "";
		gdDefString * 1024;
		for (mi=1; mi<rateClasses; mi=mi+1)
		{
			gdDefString*("global PS_"+mi+" = 1/"+((rateClasses+1)-mi)+";\nPS_"+mi+":<1;\n");
		}
		
		gdDefString*("\n\nglobal RS_1 = .3;\nRS_1:<1;RS_1:>0.000000001;\n");

		for (mi=3; mi<=rateClasses; mi=mi+1)
		{
			gdDefString*("global RS_"+mi+" = 1.5;"+"\nRS_"+mi+":>1;RS_"+mi+":<100000;\n");
		} 

		rateStrMx    = {rateClasses,1};
		rateStrMx[0] = "RS_1";
		rateStrMx[1] = "1";

		for (mi=3; mi<=rateClasses; mi=mi+1)
		{
			rateStrMx[mi-1] = rateStrMx[mi-2]+"*RS_"+mi;
		} 	

		freqStrMx    = {rateClasses,1};
		freqStrMx[0] = "PS_1";

		for (mi=1; mi<rateClasses-1; mi=mi+1)
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

		for (mi=1; mi<rateClasses; mi=mi+1)
		{
			gdDefString*("+"+rateStrMx[mi]+"*"+freqStrMx[mi]);
		}

		gdDefString*(";\ncategFreqMatrix={{"+freqStrMx[0]);

		for (mi=1; mi<rateClasses; mi=mi+1)
		{
			gdDefString*(","+freqStrMx[mi]);
		}

		gdDefString*("}};\ncategRateMatrix={{"+rateStrMx[0]+"/c_scale");

		for (mi=1; mi<rateClasses; mi=mi+1)
		{
			gdDefString*(","+rateStrMx[mi]+"/c_scale");
		}

		gdDefString*("}};c_scale:<1e25;\n\ncategory c  = ("+rateClasses+", categFreqMatrix , MEAN, ,categRateMatrix, 0, 1e25);\n\n");
		gdDefString*0;
		ExecuteCommands (gdDefString);
	}
	else
	{
		global betaP = 1;
		global betaQ = 1;
		betaP:>0.05;betaP:<85;
		betaQ:>0.05;betaQ:<85;
		category pc = (rateClasses-1, EQUAL, MEAN, 
						_x_^(betaP-1)*(1-_x_)^(betaQ-1)/Beta(betaP,betaQ), /* density */
						IBeta(_x_,betaP,betaQ), /*CDF*/
						0, 				   /*left bound*/
						1, 			   /*right bound*/
						IBeta(_x_,betaP+1,betaQ)*betaP/(betaP+betaQ)
					   );
		
		global alpha = .5;
		alpha:>0.01;alpha:<100;
		category c = (rateClasses, pc, MEAN, 
						GammaDist(_x_,alpha,alpha), 
						CGammaDist(_x_,alpha,alpha), 
						0 , 
				  	    1e25,
				  	    CGammaDist(_x_,alpha+1,alpha)
				  	 );
			
	}
	if (dataType == 0)
	{
		NucleotideMatrix	 = {{*,c*AC*t,c*t,c*AT*t}
								{c*AC*t,*,c*CG*t,c*CT*t}
								{c*t,c*CG*t,*,c*GT*t}
								{c*AT*t,c*CT*t,c*GT*t,*}};
	}
}
else
{
	if (dataType == 0)
	{
		NucleotideMatrix	 = {{*,AC*t,t,AT*t}{AC*t,*,CG*t,CT*t}{t,CG*t,*,GT*t}{AT*t,CT*t,GT*t,*}};
	}
}

if (dataType == 0)
{
	HarvestFrequencies (nucEFV, filteredData, 1, 1, 1);
	Model nucModel   = (NucleotideMatrix, nucEFV, 1);
}
else
{
	empiricalModelOverload = {};
	empiricalModelOverload[0] = "ProteinModels/"+(modelList[0+modelDesc])["File"];
	HarvestFrequencies (overallFrequencies, filteredData, 1, 1, 1);
	if (protModelFChoice == 0)
	{
		empiricalModelOverload[1] = "Empirical";
	}
	else
	{
		empiricalModelOverload[1] = "Estimated";
	
	}
	ExecuteAFile ("../Shared/Custom_AA_empirical.mdl", empiricalModelOverload);

}