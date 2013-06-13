RequireVersion  ("2.13");

fscanf  			(stdin,"String", _in_FilePath);
fscanf              (stdin,"String", _testTheseBranches);

ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile            ("FADE_tools.ibf");
ExecuteAFile            ("FUBAR_tools_iterative.ibf");
LoadFunctionLibrary     ("ReadDelimitedFiles");
LoadFunctionLibrary     ("chooseGeneticCode", {"0": "Universal"}); 
// for _alphabeticalAAOrdering

fade_grid_dimension = {{15,15}};
    /*
        number of site-scalers (relative to alignment average) [0,30]
        number of bias parameters [0, 30]
    */

 
baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
timeStamp           = baseFilePath + ".time";
baseFitFile         = baseFilePath + ".baseFit";
gridFile            = baseFilePath + ".grid";
auxInfoFile         = baseFilePath + ".info";

fscanf (auxInfoFile,   "Raw", auxInfo);
auxInfo = Eval (auxInfo);


ExecuteAFile (baseFitFile);

fscanf (timeStamp, "Number", time1);

fscanf (intermediateHTML, "Raw", status_updates);
GLOBAL_FPRINTF_REDIRECT = intermediateHTML;

status_updates = Eval (status_updates);

fadeGrid = defineFadeGrid (fade_grid_dimension[0], fade_grid_dimension[1]);
grid_description =  describeGrid (fade_grid_dimension, fadeGrid);

status_updates [_mapNumberToString(Abs(status_updates))] = {"Phase": "Computing the likelihood function on a discrete grid",
                                                "Time" : Time(1),
                                                "Information": {"00000":"Set up the grid: " + grid_description}};
                                                

availableBranchNames = BranchName (prot_tree_1, -1);
if (_testTheseBranches == "ALL") {
    _branchesToAttachFG = {};
    for (k = 0; k < Columns (availableBranchNames) - 1; k+=1) {
        _branchesToAttachFG + availableBranchNames [k];
    }
    
} else {
    _branchesToAttachFG = splitOnRegExp (_testTheseBranches, ";");
}
                                                

fprintf (gridFile, CLEAR_FILE, KEEP_OPEN, fadeGrid, "\n");

last_time = Time (1);

for (residue = 0; residue < 20; residue += 1)  {	
    if (residue == 0) {	
        Tree				biasedTree = prot_tree_1; 
    }
    
    // this copies the entire tree; model, parameters, everything
    
    AddABiasFADE2		("_customAAModelMatrix","biasedMatrix",residue);	
    
    Model				FG = (biasedMatrix, vectorOfFrequencies);
    
    if (residue == 0) { 
        _branchesToAttachFG ["applyFGModel"][""];
        ReplicateConstraint ("this1.?.?:=this2.?.?", biasedTree, prot_tree_1); 
        LikelihoodFunction    computeMe = (filteredData_1, biasedTree);
    }
    
    grid_info = computeLFOnGrid("computeMe", fadeGrid, 1);
    fprintf (gridFile, grid_info["conditionals"], "\n", grid_info["scalers"], "\n");

    updateAndWriteStatusJSON ("status_updates", Abs(status_updates)-1, 1, 
            "Computed conditional probabilities for " + _alphabeticalAAOrdering[0][residue] + " (" + runTimeEstimator (last_time,20,residue+1) + ")", 1);
     
}

fprintf (gridFile, CLOSE_FILE);
auxInfo ["BRANCHES_TESTED"] = Join (";",_branchesToAttachFG);
auxInfo ["GRID_DESCRIPTION"] =  grid_description;
fprintf (auxInfoFile, CLEAR_FILE, auxInfo);


// ------------------------------------------------------------------------------------------------------------------

function applyFGModel (key, value) {
    ExecuteCommands ("SetParameter (biasedTree." + value + ", MODEL, FG)");
    return 0;
}

// ------------------------------------------------------------------------------------------------------------------

function describeGrid (grid_dimension, the_grid) {
    variation_max = Max (the_grid[-1][0],0);
    variation_min = Min (the_grid[-1][0], 0);
    bias_max = Max (the_grid[-1][1],0);
    bias_min = Min (the_grid[-1][1], 0);
    

    return "" + 
            grid_dimension[0] + 
            " (site-to-site rate variation) x " + 
            grid_dimension[1] + 
            " (rate bias parameter) points, spaced over " + 
            "[" + 
            Format (variation_min, 8,2) + 
            "," + 
            Format (variation_max, 8,2) + 
            "] x [" +
            Format (bias_min, 8,2) + 
            "," + 
            Format (bias_max, 8,2) + 
            "]";
}