ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/DBTools.ibf");
ExecuteAFile	("../Shared/PS_Plotters.bf");

fscanf 			(stdin, "String", inFilePath);
fscanf 			(stdin, "Number", branchSpec );

spoolPATH 		= BASE_OUTPUT_PATH + inFilePath + "_gabranch.raw";

fscanf 			(spoolPATH, "Raw", inFile);
fPath 			= spoolPATH;

sscanf			(inFile,"Tree",analysisTree);
branchCount = TipCount (analysisTree) + BranchCount (analysisTree);
branchNames = BranchName (analysisTree,-1);


modelScores    = {};
branchMatrices = {};

while (!END_OF_FILE)
{
	branchRates = 0;
	sscanf (inFile, "Number,NMatrix", maic, branchRates);
	if (Abs(branchRates) == 0)
	{
		break;
	}
	modelScores[Abs(modelScores)] = maic;
	branchMatrices[Abs(branchMatrices)] = branchRates;
}


inFile 			= 0;
modelCount 		= Abs(modelScores);

bestAIC	   		= 1e100;
modelAICs  		= {modelCount,1};
branchRates 	= {branchCount, modelCount};

for (h=0; h<modelCount; h=h+1)
{
	maic = modelScores[h];
	branchMatrix = branchMatrices[h];
	if (maic<bestAIC)
	{
		bestAIC = maic;
		bestModel = branchMatrix;
	}
	for (v2=0; v2<branchCount;v2=v2+1)
	{
		branchRates[v2][h] = branchMatrix[v2];
	}
	modelAICs[h] = maic;
}

modelScores    = 0;
branchMatrices = 0;

normalizer = 0;

for (h=0; h<modelCount; h=h+1)
{
	modelAICs[h] = Exp(-(modelAICs[h]-bestAIC)*0.5);
	normalizer = normalizer+modelAICs[h];
}

modelAICs = modelAICs * (1/normalizer); 

probabilityMatrix = {modelCount,2};

for (v=0; v<modelCount; v=v+1)
{
	probabilityMatrix[v][0] = branchRates[branchSpec][v];
	probabilityMatrix[v][1] = modelAICs[v];
}
probabilityMatrix = probabilityMatrix%0;

minVal = probabilityMatrix[0][0];
maxVal = probabilityMatrix[modelCount-1][0];

if (minVal == maxVal)
{
	maxVal = minVal + 0.01;
}

stepCount 	 = 25;
step		 = (maxVal-minVal)/stepCount;
histMatrix 	 = {stepCount,2};

v = 0;
for (h=minVal; h<maxVal-step; h=h+step)
{
	histMatrix[v][0] = h;
	v = v + 1;
}

for (h=0; h<modelCount; h=h+1)
{
	v = (probabilityMatrix[h][0]-minVal)/step$1;
	if (v >= stepCount)
	{
		v = stepCount - 1;
	}
	histMatrix[v][1] = histMatrix[v][1] + probabilityMatrix[h][1];
}

rgb_colors	= { { 0, 0, 255 } };
fig_size	= { { 400, 400, 12 } };
plot_title = "Distribution of dN/dS substitution rates along " + branchNames[branchSpec];
x_title = "dN/dS " + branchNames[branchSpec];


plot_legend = { { plot_title, x_title, "Weight" } };

fprintf ( stdout, PSHistogram (histMatrix,-1,1,arial,fig_size,rgb_colors,plot_legend,1) );

/*
outString = "";
outString * 8192;
outString * ("" + histMatrix[0][0] + " " + histMatrix[0][1]);

for (h=1; h<stepCount; h=h+1)
{
	outString * ("\n" + histMatrix[h][0] + " " + histMatrix[h][1]);
}
outString * 0;

fPath = fPath+".gpin";
fprintf (fPath, CLEAR_FILE, outString);
*/
