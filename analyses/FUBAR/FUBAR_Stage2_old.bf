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
nonSynRate:=0.25*synRate;
ExecuteCommands   ("FindRoot(cf,`mgBrLen`-3,synRate,0,1e10);");
nonSynRate=synRate;
paramName = paramName[Abs(prefix) + 1][Abs(paramName)-1];

scalingFactor = cf/nf;

global alpha = 1;
global beta  = 1;

for (file_part = 1; file_part <= fileCount; file_part += 1) {
    treeString = Eval ("Format (" + (nucLF_Info["Trees"])[file_part-1] + ",1,1)");
    ExecuteCommands   ("Tree codon_tree_" + file_part + " = " + treeString);
    ExecuteCommands   ("DataSetFilter codon_filter_" + file_part + " = CreateFilter (" + (nucLF_Info["Datafilters"])[file_part-1] + ",3,,,GeneticCodeExclusions)");
    ExecuteCommands   ("ReplicateConstraint (\"this1.?.synRate:=alpha*scalingFactor__*this2.?.`paramName`__\",codon_tree_" + file_part + "," +  (nucLF_Info["Trees"])[file_part-1] + ");");
    ExecuteCommands   ("ReplicateConstraint (\"this1.?.nonSynRate:=beta*scalingFactor__*this2.?.`paramName`__\",codon_tree_" + file_part + "," +  (nucLF_Info["Trees"])[file_part-1] + ");");
}

ExecuteCommands (constructLF ("codonLF", "codon_filter", "codon_tree", fileCount));


grid = defineAlphaBetaGrid (20);

fprintf         (intermediateHTML, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 2]</b> Computing site-by-site likelihoods at ", Rows(grid), " grid points</DIV>");
gridInfo        = computeLFOnGrid ("codonLF", grid);

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
    neg_sel_points  = (one_d_points)*neg_sel$1+1;
    pos_sel_points  = (one_d_points-1)*(1-neg_sel)$1;
    if (neg_sel_points + pos_sel_points > one_d_points) {
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
//------------------------------------------------------------------------------------------------//

function computeLFOnGrid (lfID, grid) {
    points = Rows (grid);
    
    result = {};
    
    t0 = Time (1);
    _startPoint = 0;

    if (MPI_NODE_COUNT > 1 && points > MPI_NODE_COUNT) {
        per_node    = points $ MPI_NODE_COUNT;
        _startPoint = points-per_node;
        leftover    = points-per_node*MPI_NODE_COUNT;
        
        from          = 0;
        to            = per_node + (leftover>0);
        node_ranges   = {MPI_NODE_COUNT,2};
        
        for (node_id = 1; node_id < MPI_NODE_COUNT; node_id += 1) {
            LF_NEXUS_EXPORT_EXTRA	= 
                   "LFCompute(`lfID`,LF_START_COMPUTE);
                    grid=" + grid[{{from,0}}][{{to-1,1}}] + ";\n
                    points = Rows (grid);
                    for (_r = 0 ; _r < points; _r += 1){
                            alpha = grid[_r][0];
                            beta  = grid[_r][1];
                            ConstructCategoryMatrix(catMat,`lfID`,SITE_LOG_LIKELIHOODS);
                            
                            if (_r == 0) {
                                _siteCount = Columns (catMat);
                                MPI_NEXUS_FILE_RETURN = {points, _siteCount};
                            }
                            
                            for (_c = 0; _c < _siteCount; _c += 1) {
                                MPI_NEXUS_FILE_RETURN[_r][_c] = catMat[_c];
                            }
                        }
                        LFCompute(`lfID`,LF_DONE_COMPUTE);
                        return MPI_NEXUS_FILE_RETURN;";                                       
                                    
            ExecuteCommands 	("Export(lfExport,`lfID`);");
            MPISend				(node_id, lfExport);            
            //fprintf             ("dump." + node_id, CLEAR_FILE, lfExport);
            //fprintf				(stdout, "[SENT RANGE ", from+1, " - ", to, " TO MPI NODE ", node_id, "]\n");   
            
            node_ranges [node_id][0]         = from;
            node_ranges [node_id][1]         = to;
            
            from                             = to;
            to                              += per_node+(node_id<=leftover);  
        } 
    }
    
    ExecuteCommands ("LFCompute(`lfID`,LF_START_COMPUTE)"); 
           
    for (_r = _startPoint; _r < points; _r += 1){
        alpha = grid[_r][0];
        beta  = grid[_r][1];
        ExecuteCommands ("ConstructCategoryMatrix(catMat,`lfID`,SITE_LOG_LIKELIHOODS)");
        
        if (_r == _startPoint) {
            _siteCount = Columns (catMat);
            conditionals = {points, _siteCount};
            scaler = {1,_siteCount};
        }
        
        for (_c = 0; _c < _siteCount; _c += 1) {
            conditionals[_r][_c] = catMat[_c];
        }
        SetParameter (STATUS_BAR_STATUS_STRING, "Computing the likelihood function on grid points "+ (_r+1) + "/" + points + " " + _formatTimeString(Time(1)-t0),0);
    }
    ExecuteCommands ("LFCompute(`lfID`,LF_DONE_COMPUTE)");
    
    //fprintf (stdout,"\n");

    if (MPI_NODE_COUNT > 1 && points > MPI_NODE_COUNT) {
         for (node_id = 1; node_id < MPI_NODE_COUNT; node_id += 1) {
            MPIReceive (-1,fromNode,res);
		    sscanf  (res, REWIND, "NMatrix", mpires);
		    
		    from = node_ranges[fromNode][0];
		    to   = node_ranges[fromNode][1];
		    
            /*fprintf				(stdout, "[GOT RANGE ", from+1, " - ", to, ":", 
                                           Rows(mpires), " FROM MPI NODE ", fromNode, "]\n"); 
            */
            
		    for (_r = 0; _r < Rows(mpires); _r += 1) {
                for (_c = 0; _c < _siteCount; _c += 1) {
                    conditionals [_r+from][_c] = mpires[_r][_c];
                }
		    }
		}

    }

    for (_c = 0; _c < _siteCount; _c += 1) {
        this_site  = conditionals[-1][_c];
        best_log_l = Min (this_site*(-1),0);
        this_site  = (this_site + best_log_l)["Exp(_MATRIX_ELEMENT_VALUE_)"];
        normalizer = +this_site;
        this_site  = (this_site)*(1/normalizer);
        scaler[_c] = -best_log_l+Log(normalizer);
        for (_r = 0; _r < points; _r += 1) {
            conditionals[_r][_c] = this_site[_r];
        }
    }
    
    result["conditionals"] = conditionals;
    result["scalers"]      = scaler;
    
    return result;
}