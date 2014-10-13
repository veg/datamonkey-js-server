
categDef1 = "";
categDef2 = "";
categDef1 * 8192;
categDef2 * 8192;

for (mi=1; mi<resp; mi=mi+1)
{
	categDef1*("global PS_"+mi+" = 1/"+((resp+1)-mi)+";\nPS_"+mi+":<1;\n");
}
categDef1*("\n\nglobal RS_1 = .3;\nRS_1:<1;RS_1:>0.000000001;\n");

for (mi=3; mi<=resp; mi=mi+1)
{
	categDef1*("global IRS_"+mi+" = 2/3;\nIRS_"+mi+":<1;global RS_"+mi+":=1/IRS_"+mi+";\n");
} 

rateStrMx    = {resp,1};
rateStrMx[0] = "RS_1";
rateStrMx[1] = "1";

for (mi=3; mi<=resp; mi=mi+1)
{
	rateStrMx[mi-1] = rateStrMx[mi-2]+"*RS_"+mi;
} 	

freqStrMx    = {resp,1};
freqStrMx[0] = "PS_1";

for (mi=1; mi<resp-1; mi=mi+1)
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
if (resp>1)
{
	freqStrMx[mi] = freqStrMx[mi]+"(1-PS_"+mi+")";	
}
else
{
	freqStrMx[mi] = freqStrMx[mi]+"1";	
}

categDef1*("\n\nglobal c_scale:="+rateStrMx[0]+"*"+freqStrMx[0]);

for (mi=1; mi<resp; mi=mi+1)
{
	categDef1*("+"+rateStrMx[mi]+"*"+freqStrMx[mi]);
}

categDef1*(";\ncategFreqMatrix={{"+freqStrMx[0]);

for (mi=1; mi<resp; mi=mi+1)
{
	categDef1*(","+freqStrMx[mi]);
}

categDef1*("}};\ncategRateMatrix={{"+rateStrMx[0]+"/c_scale");

for (mi=1; mi<resp; mi=mi+1)
{
	categDef1*(","+rateStrMx[mi]+"/c_scale");
}

categDef1*("}};\n\ncategory c      = ("+resp+", categFreqMatrix , MEAN, ,categRateMatrix, 0, 1e25);\n\n");
categDef1*0;

/* begin non-syn */


categDef2*("\n\nglobal RN_1 = .3;\nRN_1:<1;\n");

for (mi=2; mi<=resp2; mi=mi+1)
{
	categDef2*("global IRN_"+mi+" = 2/3;\nIRN_"+mi+":<1;global RN_"+mi+":=1/IRN_"+mi+";\n");
} 

rateStrMx    = {resp2,1};
rateStrMx[0] = "RN_1";

for (mi=2; mi<=resp2; mi=mi+1)
{
	rateStrMx[mi-1] = rateStrMx[mi-2]+"*RN_"+mi;
} 	

for (mi=1; mi<resp2; mi=mi+1)
{
	categDef2*("global PN_"+mi+" = 1/"+ ((resp2+1)-mi)+";\nPN_"+mi+":<1;\n");	
}

freqStrMx    = {resp2,1};
freqStrMx[0] = "PN_1";

for (mi=1; mi<resp2-1; mi=mi+1)
{
	freqStrMx[mi] = "";
	for (mi2=1;mi2<=mi;mi2=mi2+1)
	{
		freqStrMx[mi] = freqStrMx[mi]+"(1-PN_"+mi2+")";		
	}
	freqStrMx[mi] = freqStrMx[mi]+"PN_"+(mi+1);	
}	

freqStrMx[mi] = "";
for (mi2=1;mi2<mi;mi2=mi2+1)
{
	freqStrMx[mi] = freqStrMx[mi]+"(1-PN_"+mi2+")";		
}

if (resp2>1)
{
	freqStrMx[mi] = freqStrMx[mi]+"(1-PN_"+mi+")";	
}
else
{
	freqStrMx[mi] = freqStrMx[mi]+"1";	
}

categDef2*("categRateMatrixN={{"+rateStrMx[0]);

for (mi=1; mi<resp2; mi=mi+1)
{
	categDef2*(","+rateStrMx[mi]);
}

categDef2*("}};\n");

categDef2*("\n\ncategFreqMatrixN={{"+freqStrMx[0] );

for (mi=1; mi<resp2; mi=mi+1)
{
	categDef2*(","+ freqStrMx[mi]);
}

categDef2*("}};\n\ncategory d     = ("+resp2+", categFreqMatrixN , MEAN, ,categRateMatrixN, 0, 1e25);\n\n");
categDef2*0;