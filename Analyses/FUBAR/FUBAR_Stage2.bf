timer = Time(1);

RequireVersion  ("2.11");

fscanf  			(stdin,"String", _in_FilePath);
fscanf  			(stdin,"Number", _in_GeneticCodeTable);

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";


skipCodeSelectionStep    = 1;
ExecuteAFile			("../Shared/chooseGeneticCode.def");
ApplyGeneticCodeTable (_in_GeneticCodeTable);

_runAsFunctionLibrary=1;
LoadFunctionLibrary ("_MFReader_");
LoadFunctionLibrary ("GrabBag");
ExecuteAFile (PATH_TO_CURRENT_BF + "FUBAR_tools.ibf");

nucFit = baseFilePath + ".nucFit";
prefix = "existingFit";

ExecuteAFile (nucFit,"","existingFit");

LoadFunctionLibrary ("LocalMGREV"); 
LoadFunctionLibrary ("CF3x4");


nuc3x4 = CF3x4 (existingFit.positionalFrequencies,GeneticCodeExclusions);
PopulateModelMatrix ("MGLocalQ", nuc3x4);
vectorOfFrequencies = BuildCodonFrequencies(nuc3x4);
Model MGLocal = (MGLocalQ, vectorOfFrequencies,0);

GetString (nucLF_Info, existingFit.nucLF, -1);
fileCount = Columns (nucLF_Info["Trees"]);

AC := existingFit.AC;
AT := existingFit.AT;
CG := existingFit.CG;
CT := existingFit.CT;
GT := existingFit.GT;

GetString (mgBrLen, MGLocal, -1);
ExecuteCommands ("GetString (nucBrLen, "+(nucLF_Info["Models"])[0]+",-1);");
ExecuteCommands ("GetString (nucMdlInfo, "+(nucLF_Info["Models"])[0]+",-2);");
ExecuteCommands ("GetString (nuclParamInfo, "+nucMdlInfo["RATE_MATRIX"]+",-1)");

assert            (Columns(nuclParamInfo["Local"])==1,"The nucleotide model must have exactly one local parameter");
paramName       = (nuclParamInfo["Local"])[0]; 
ExecuteCommands   ("FindRoot(nf,`nucBrLen`-1,`paramName`,0,1e10);");
paramName = paramName[Abs(prefix) + 1][Abs(paramName)-1];

function rescaleBranchLengths (dNdS, firstPass) {
    nonSynRate:=dNdS*synRate;
    ExecuteCommands   ("FindRoot(cf,`mgBrLen`-3,synRate,0,1e10);");
    nonSynRate=synRate;
    
    scalingFactor = cf/nf;
    
    global alpha = 1;
    global beta  = dNdS;
        
    for (file_part = 1; file_part <= fileCount; file_part += 1) {
        if (firstPass) {
            treeString = Eval ("Format (" + (nucLF_Info["Trees"])[file_part-1] + ",1,1)");
            ExecuteCommands   ("Tree codon_tree_" + file_part + " = " + treeString);
            ExecuteCommands   ("DataSetFilter codon_filter_" + file_part + " = CreateFilter (" + (nucLF_Info["Datafilters"])[file_part-1] + ",3,,,GeneticCodeExclusions)");
        } else {
            ExecuteCommands ("ClearConstraints (codon_tree_" + file_part + ");");
        }
        ExecuteCommands   ("ReplicateConstraint (\"this1.?.synRate:=alpha*scalingFactor__*this2.?.`paramName`__\",codon_tree_" + file_part + "," +  (nucLF_Info["Trees"])[file_part-1] + ");");
        ExecuteCommands   ("ReplicateConstraint (\"this1.?.nonSynRate:=beta*scalingFactor__*this2.?.`paramName`__\",codon_tree_" + file_part + "," +  (nucLF_Info["Trees"])[file_part-1] + ");");
    }
    return 0;
}

rescaleBranchLengths (0.5,1);
ExecuteCommands (constructLF ("codonLF", "codon_filter", "codon_tree", fileCount));
//ExecuteCommands ("fprintf (stdout, codonLF);");

grid = defineAlphaBetaGrid (20);

fprintf         (intermediateHTML, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 2.1]</b> Determining appropriate branch scaling using the ", Rows(grid), " default grid points</DIV>");
bestPair        = computeLFOnGrid ("codonLF", grid, 0);
bestPair        = bestPair%2;
bestAlpha = bestPair [Rows(bestPair)-1][0];
bestBeta  = bestPair [Rows(bestPair)-1][1];

if (bestAlpha < 0.01) {
    bestAlpha = 0.01;
}

//fprintf (stdout, bestPair, "\n");

LF_NEXUS_EXPORT_EXTRA = "";
rescaleBranchLengths (bestBeta/bestAlpha,0);
Export(lfExport,codonLF);
codonFit = baseFilePath + ".codonFit";
fprintf (codonFit, CLEAR_FILE,lfExport); 


fprintf         (intermediateHTML, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 2.2]</b> Best scaling achieved for dN/dS = ", Format(bestBeta/bestAlpha,5,2), ". Computing site-by-site likelihoods at ", Rows(grid), " grid points</DIV>");
gridInfo        = computeLFOnGrid ("codonLF", grid, 1);

fprintf         (intermediateHTML, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 2 DONE]</b> Finished with likelihood calculations. Achieved throughput of  ",
                                   Format(Rows(grid)/(Time(1)-timer),4,2), " calculations/second</DIV>");

gridInfoFile = baseFilePath + ".grid_info";

fprintf (gridInfoFile,CLEAR_FILE, grid, "\n", gridInfo);

//------------------------------------------------------------------------------------------------//

function defineAlphaBetaGrid (one_d_points) {
    alphaBetaGrid = {one_d_points^2,2}; // (alpha, beta) pair
    oneDGrid      = {one_d_points,1};
   
    one_d_points    = Max (one_d_points, 10);
    neg_sel         = 0.7;
    neg_sel_points  = ((one_d_points)*neg_sel+0.5)$1;
    pos_sel_points  = (one_d_points-1)*(1-neg_sel)$1;
    if (neg_sel_points + pos_sel_points != one_d_points) {
        pos_sel_points = one_d_points - neg_sel_points; 
    }
    _neg_step = 1/neg_sel_points;
    for (_k = 0; _k < neg_sel_points; _k += 1) {
        oneDGrid [_k][0] =  _neg_step * _k;
    }
    oneDGrid [neg_sel_points-1][0] = 1;
    _pos_step = 49^(1/3)/pos_sel_points;
    for (_k = 1; _k <= pos_sel_points; _k += 1) {
        oneDGrid [neg_sel_points+_k-1][0] = 1+(_pos_step*_k)^3;
    }
    
    _p = 0;
    for (_r = 0; _r < one_d_points; _r += 1) {
        for (_c = 0; _c < one_d_points; _c += 1) {
           alphaBetaGrid[_p][0] = oneDGrid[_r];
           alphaBetaGrid[_p][1] = oneDGrid[_c];
           _p += 1;
        }
    }
    
    return alphaBetaGrid;   
}
