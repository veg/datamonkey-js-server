RequireVersion  ("2.13");
ExecuteAFile			("../Shared/globals.ibf");
ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile            ("FUBAR_tools_iterative.ibf");
LoadFunctionLibrary     ("WriteDelimitedFiles");

LoadFunctionLibrary     ("chooseGeneticCode", {"0": "Universal"}); 
// for _alphabeticalAAOrdering

     
fscanf  			(stdin,"String", _in_FilePath);

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
gridFile            = baseFilePath + ".grid";
weightsFile         = baseFilePath + ".weights";
resultsFile         = baseFilePath + ".out";
auxInfoFile         = baseFilePath + ".info";
timeFile            = baseFilePath + ".time";

fscanf (auxInfoFile,   "Raw", auxInfo);
auxInfo = Eval (auxInfo);

fscanf (timeFile, "Number", time1);
fscanf (intermediateHTML, "Raw", status_updates);
status_updates = Eval (status_updates);

GLOBAL_FPRINTF_REDIRECT = intermediateHTML;

status_updates [_mapNumberToString(Abs(status_updates))] = {"Phase": "Computing posterior probabilities for directional selection",
                                                "Time" : Time(1),
                                                "Information": {"00000":"Loading grid info and estimated weights"}};

                                                
fscanf (weightsFile, "Raw", weights);
weights = Eval (weights);

fscanf (gridFile, "NMatrix", grid);

last_time = Time (1);

sites_with_deps = {};

for (_residue_id = 0; _residue_id < 20; _residue_id += 1) {
    fscanf (gridFile, "NMatrix,NMatrix", current_conditionals, current_scalers);
    _res = _alphabeticalAAOrdering [_residue_id];
    

    learntWeights = weights [_res];
	transWeights = Transpose(learntWeights);
	
	if(_residue_id == 0) {
        points              = Rows(current_conditionals);
	    sites  		     = Columns (current_conditionals);
		full_table = {sites, 1+(5*20)};
	    for (s = 0; s < sites; s+=1) {
	        full_table[s][0] = s+1;
	    }
        //KLUDGE: "grid[_MATRIX_ELEMENT_ROW_][1]>0.001" to deal with removable discontinuity of Lacerda parameterization
        P_selection_stamp = {points,1} ["grid[_MATRIX_ELEMENT_ROW_][1]>0.001"];
        P_prior = +(learntWeights$P_selection_stamp);
        P_odds  = P_prior / (1-P_prior);
        positive_selection_stencil = {points,sites} ["grid[_MATRIX_ELEMENT_ROW_][1]>0.001"];
        negative_selection_stencil = {points,sites} ["grid[_MATRIX_ELEMENT_ROW_][1]<=0.001"];
        diag_alpha = {points,points}["grid[_MATRIX_ELEMENT_ROW_][0]*(_MATRIX_ELEMENT_ROW_==_MATRIX_ELEMENT_COLUMN_)"];
        diag_beta  = {points,points}["grid[_MATRIX_ELEMENT_ROW_][1]*(_MATRIX_ELEMENT_ROW_==_MATRIX_ELEMENT_COLUMN_)"];
	}
    
   updateAndWriteStatusJSON ("status_updates", Abs(status_updates)-1, 1, 
            "Computed posterior probabilities for " + _alphabeticalAAOrdering[0][_residue_id] + " (" + runTimeEstimator (last_time,20,_residue_id+1) + ")", 1);
	
	    
	norm_matrix         = transWeights*current_conditionals;
	poster_matrix = {points,sites}["(transWeights[_MATRIX_ELEMENT_ROW_]*current_conditionals[_MATRIX_ELEMENT_ROW_][_MATRIX_ELEMENT_COLUMN_])/norm_matrix[_MATRIX_ELEMENT_COLUMN_]"];
	pos_sel_matrix      = (transWeights*(current_conditionals$positive_selection_stencil) / norm_matrix);
	pos_sel_bfs= pos_sel_matrix["pos_sel_matrix[_MATRIX_ELEMENT_COLUMN_]/(1-pos_sel_matrix[_MATRIX_ELEMENT_COLUMN_])/ P_odds"];
	neg_sel_matrix      = (transWeights*(current_conditionals$negative_selection_stencil) / norm_matrix);
	alpha_matrix        = ((transWeights*diag_alpha*current_conditionals)/norm_matrix);
	beta_matrix         = ((transWeights*diag_beta*current_conditionals)/norm_matrix);
	
    offset = _residue_id*5 + 1;
	for (s = 0; s < sites; s+=1) {
		full_table[s][offset] = alpha_matrix[s];
		full_table[s][offset+1] = beta_matrix[s];
		full_table[s][offset+2] = neg_sel_matrix[s];
		full_table[s][offset+3] = pos_sel_matrix[s];
		full_table[s][offset+4] = pos_sel_bfs[s];
		
		if (pos_sel_bfs[s] >= 20) {
		    sites_with_deps[s] = 1;
		}
	}
}

fubarRowCount     = Rows (full_table);
site_counter = {};
for (currentFubarIndex = 0; currentFubarIndex < fubarRowCount; currentFubarIndex += 1) {
    site_counter + (currentFubarIndex+1);
}

header = {1, (5*20)+1};
header[0] = "Position";
for(residue = 0 ; residue < 20 ; residue += 1)
{
	header[residue*5+1] = _alphabeticalAAOrdering[residue]+":"+"alpha";
	header[residue*5+2] = _alphabeticalAAOrdering[residue]+":"+"bias";
	header[residue*5+3] = _alphabeticalAAOrdering[residue]+":"+"Prob[bias=1]";
	header[residue*5+4] = _alphabeticalAAOrdering[residue]+":"+"Prob[bias>1]";
	header[residue*5+5] = _alphabeticalAAOrdering[residue]+":"+"BF[beta>alpha]";
}


WriteSeparatedTable (resultsFile, header, full_table, site_counter, ",");
auxInfo ["FADE"] = full_table;
auxInfo ["HEADERS"] = header;

fprintf (resultsFile, CLEAR_FILE, auxInfo);

fprintf             (stdout, CLEAR_FILE, "DONE");
GetString 			(time_info, TIME_STAMP, 1);
fprintf 			("usage.log",time_info[0][Abs(time_info)-2],",",auxInfo["SPECIES"],",",sites,",",Time(1)-time1, ",", Abs (sites_with_deps), "\n");
