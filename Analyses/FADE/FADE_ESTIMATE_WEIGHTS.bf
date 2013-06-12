RequireVersion  ("2.13");
ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile            ("FADE_tools.ibf");
ExecuteAFile            ("FUBAR_tools_iterative.ibf");
LoadFunctionLibrary     ("ReadDelimitedFiles");

LoadFunctionLibrary     ("chooseGeneticCode", {"0": "Universal"}); 
// for _alphabeticalAAOrdering

     
fscanf  			(stdin,"String", _in_FilePath);
fscanf              (stdin,"Number", _concentration);
   /* Dirichlet prior */
 
// ';' separated list of branches to put the FG model on

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
timeStamp           = baseFilePath + ".time";
gridFile            = baseFilePath + ".grid";
weightsFile            = baseFilePath + ".weights";

fscanf (timeStamp, "Number,Number", time0, time1);

fscanf (intermediateHTML, "Raw", status_updates);
status_updates = Eval (status_updates);

GLOBAL_FPRINTF_REDIRECT = intermediateHTML;
status_updates [_mapNumberToString(Abs(status_updates))] = {"Phase": "Running FADE estimation of posterior grid points weight using regularized ML (MAP/Variational Bayes)",
                                                "Time" : Time(1),
                                                "Information": {"00000":"Loading grid information"}};

fitted_weights = {};
                                                
fscanf (gridFile, "NMatrix", grid_points);

_optimizationTaskInformation = {};

last_time = Time (1);

GLOBAL_FPRINTF_REDIRECT = intermediateHTML;
status_updates [_mapNumberToString(Abs(status_updates))] = {"Phase": "Running FADE estimation of posterior grid points weight using regularized ML (MAP/Variational Bayes)",
                                                "Time" : Time(1),
                                                "Information": {"00000":"Loading grid information"}};

for (_residue_id = 0; _residue_id < 20; _residue_id += 1) {
    fscanf (gridFile, "NMatrix,NMatrix", current_conditionals, current_scalers);
    _runAResidue (_alphabeticalAAOrdering[_residue_id], grid_points,  current_conditionals, _concentration);          
}

while (Abs (_optimizationTaskInformation)) {
    _receiveAJob ();
}

fprintf (weightsFile, CLEAR_FILE, fitted_weights, "\n");

/******************************************************************************************************/
function _runAResidue (_res, grid_points, current_conditionals, _concentration) {

    if (MPI_NODE_COUNT <= 1) {
        _nodeID = 0;
    } else {
        for (_nodeID = 0; _nodeID < MPI_NODE_COUNT-1; _nodeID += 1) {
            if (Abs(_optimizationTaskInformation [_nodeID])==0) {
                break;
            }
        }
        if (_nodeID == MPI_NODE_COUNT - 1) {
            _nodeID = _receiveAJob ();
        }
    }
    _optimizationTaskInformation [_nodeID] = {"Residue" : _res};

    if (MPI_NODE_COUNT <= 1) {
        optimized_weights = runIterativeDeterministic (grid_points, current_conditionals, _concentration);
        _receiveAJob ();
    } else {
        MPISend (_nodeID+1, 
        "ExecuteAFile (\"" + PATH_TO_CURRENT_BF + "FUBAR_tools_iterative.ibf\");
        pts = " + grid_points + ";
        wts = " + current_conditionals + ";
        return runIterativeDeterministic (pts, wts, " + _concentration + ");"
        );
    }

    return None;
    
} 

/******************************************************************************************************/

function _receiveAJob () {
    if (MPI_NODE_COUNT <= 1) {
        _fromID = 0;
        _fromNode = "";
    } else {
        MPIReceive (-1,_fromID,_serializedResult);
         optimized_weights = Eval(_serializedResult);
        _fromID = _fromID - 1;
        _fromNode = " from node " + _fromID;
    }
     
    fitted_weights [(_optimizationTaskInformation [_fromID])["Residue"]] = optimized_weights; 
    _finishedResidues += 1;
    updateAndWriteStatusJSON ("status_updates", Abs(status_updates)-1, 1, "Finished estimates for " + Join (",", Rows(fitted_weights)) + " (" + runTimeEstimator (last_time,20,_finishedResidues) + ")", 1);

    _optimizationTaskInformation - _fromID;
    
    return _fromID;
} 