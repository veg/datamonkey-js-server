RequireVersion  ("2.11");
LoadFunctionLibrary ("GrabBag");

fscanf  			(stdin,"String", _in_FilePath);
fscanf              (stdin,"Number", _chainsToRun);
ExecuteAFile        (PATH_TO_CURRENT_BF + "FUBAR_tools.ibf");

assert (_chainsToRun > 1, "Must specify at least MCMC TWO chains to run");

/* the MCMC function */

baseFilePath  		= PATH_TO_CURRENT_BF + "spool/"+_in_FilePath;
intermediateHTML	= _in_FilePath + ".progress";

function runMCMC (_in_FilePath, chainID){
    intermediateHTML	= _in_FilePath + ".progress";
    gridFile = _in_FilePath + ".grid_info";
    fscanf (gridFile, REWIND, "NMatrix,Raw", grid, gridInfo);
    gridInfo = Eval(gridInfo);
    
    points         = Rows(grid);
    sites          = Columns(gridInfo["conditionals"]);
    normalize_by_site  = ({1,points}["1"])*(gridInfo["conditionals"]);
    normalized_weights = (gridInfo["conditionals"])*({sites,sites}["1/normalize_by_site[_MATRIX_ELEMENT_ROW_]*(_MATRIX_ELEMENT_ROW_==_MATRIX_ELEMENT_COLUMN_)"]);
    sum_by_site        = normalized_weights * ({sites,1}["1"]);
    /*if (MPI_NODE_ID == 0) {
        fprintf ("dump", CLEAR_FILE, sum_by_site, "\n");
    }*/
    
    weights = {1,points}["Random(sum_by_site[_MATRIX_ELEMENT_COLUMN_]*0.8,sum_by_site[_MATRIX_ELEMENT_COLUMN_]*1.2)"];
    weights = weights * (1/(+weights));
    
    //filename = _in_FilePath + "_init." + chainID;
    
    gridSampled = {points, 3};
    for (k = 0; k < points; k+=1) {
        gridSampled[k][0] = grid[k][0];
        gridSampled[k][1] = grid[k][1];
        gridSampled[k][2] = weights[k];
    }
    
    //fprintf (filename, CLEAR_FILE, gridSampled);
    
    defaultStep = Max(Min(0.001,1/sites),(weights%0)[points*50$100]);
    
     
    currentSiteLikelihoods = siteLikelihoodsGivenWeights (weights);
    currentSiteLogSum      = +(currentSiteLikelihoods["Log(_MATRIX_ELEMENT_VALUE_)"]);
    currentLogL            = jointLogL (weights, _concentration_parameter);
    individualGridPointContribs = {};
    
    for (k = 0; k < points; k+=1) {
        individualGridPointContribs [k] = (gridInfo["conditionals"])[k][-1];
    }    
    
    total                  = 2000000;
    contracting            = total$5;
    discard                = total$2;
    sample                 = (total-discard)$100;
    _concentration_parameter = 0.5;
   
    expected_samples     = (total-discard)$sample;
    sampled_weights      = {expected_samples,points};
    sampled_likelihoods  = {1,expected_samples};
    
    time0                = Time(1);
    sample_index         = 0;
    
    baselineStep         = defaultStep;
    reductionFactor      = 1;
    accepted_steps       = 0;

    if (MPI_NODE_ID == 0) {
        fprintf         (intermediateHTML, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 3]</b> Running an MCMC chain to obtain a posterior sample of grid point weights: ", total, " total steps, of which ",
                                            discard, " will be discarded as burn-in, and sampling every ", sample, " steps. ",
                                            "In addition, ", _chainsToRun-1 , " independent chains (started at random points in the search spaces) are being run in parallel to evaluate convergence and effective sample sizes. The final sample will include thinned post burn-in representatives from all chains.",
                                            "</DIV>");
                                            
        fscanf          (intermediateHTML, "Raw", progressPrefix);
    }

    totalStepSum        = 0;
    meanSampledLogL     = 0;
    initialLogL         = currentLogL[0];

    for (steps = 0; steps < total; steps += 1) {              

        idx    = Random (0, points-1e-10)$1;
        idx2   = Random (0, points-1e-10)$1;
        while (idx == idx2) {
            idx2   = Random (0, points-1e-10)$1;     
        }
        
        if ((steps+1) % contracting == 0) {
            baselineStep = baselineStep*reductionFactor;
        }
        
        change = Random (0,baselineStep);
        //change = Random (0,(weights[idx]+weights[idx2])/2);
        totalStepSum += change;
        
        if (weights[idx] > change) {
            diffVector          = (individualGridPointContribs[idx2]-individualGridPointContribs[idx])*change;
            logLDiff            = +((currentSiteLikelihoods + diffVector)["Log(_MATRIX_ELEMENT_VALUE_)"]) - currentSiteLogSum;
            diffPrior           = (_concentration_parameter-1)*(Log((weights[idx]-change)/weights[idx])+Log((weights[idx2]+change)/weights[idx2]));
            costOfMove          = logLDiff+diffPrior;
            
            if (Random (0,1) <= Exp (costOfMove)) {
            
                currentLogL[0] += logLDiff;
                currentLogL[1] += diffPrior;
         
                currentSiteLikelihoods += diffVector;
                currentSiteLogSum += logLDiff;
                 
                weights[idx]  += (-change);
                weights[idx2] += (+change);
                accepted_steps += 1;
            } 
        }
        
        if (steps > discard) {
            if ((steps - discard + 1) % sample == 0) {
                for (dd = 0; dd < points; dd += 1) {
                    sampled_weights[sample_index][dd] = weights[dd];
                }
                sampled_likelihoods[sample_index] = currentLogL[0];
                meanSampledLogL += currentLogL[0];
                sample_index += 1;
            }
        } 
    
        if ((1+steps) % sample == 0) {
            //fprintf (stdout, chainID, ":", sample_index, ":", currentLogL[0], "\n");
            if (MPI_NODE_ID == 0) {
                reportLogL = "";
                if (steps > discard) {
                    reportLogL = "<DT class = 'DT2'>Mean sampled log(L): " + Format(meanSampledLogL/sample_index,6,3) + "</DT>";
                }
                fprintf         (intermediateHTML, CLEAR_FILE, progressPrefix, "<DIV class = 'RepClassSM'> MCMC progress <DL><DT class = 'DT1'>Current/initial log(L): "+currentLogL[0] + "/" + initialLogL + "</DT><DT class = 'DT2'>" + Format((steps+1)/(Time(1)-time0),6,0) + " moves/sec </DT><DT class = 'DT1'> Sampled states: " + (1+steps) + "</DT><DT class = 'DT2'>Acceptance rate: " + Format(accepted_steps/steps,4,2) + 
                "</DT><DT class = 'DT1'>Mean proposal step: " + Format(totalStepSum/steps,6,3) + 
                reportLogL +
                "</DT></DL></DIV>");   
                SetParameter (STATUS_BAR_STATUS_STRING, "Running the MCMC chain "+ (1+steps) + "/" + total + ". " + currentLogL[0] + "("+ initialLogL+ ")", 0);
            }
        }
    }

    mcmcfile = _in_FilePath + ".samples." + chainID;
    fprintf (mcmcfile,CLEAR_FILE, sampled_likelihoods, "\n\n", sampled_weights);
    
    return 0;
}

debug = 0;

if (!debug) {
    funcText = "";
    funcsToExport = {"0": "runMCMC", "1": "jointLogL", "2": "LogDrichletDensity", "3": "computeLogLFfromGridAndWeights", "4": "siteLikelihoodsGivenWeights"};
    for (k = 0; k < Abs (funcsToExport); k+=1)
    {
        funcText += exportFunctionDefinition (funcsToExport[k]);
    }
    
    
    funcText += "\nfor (_chainIndex=start; _chainIndex<end; _chainIndex+=1) {runMCMC(_fileName,_chainIndex);} return 0;";
                                    
     if (MPI_NODE_COUNT > 1 && _chainsToRun > 1) {
            per_node    = Max(1,_chainsToRun $ MPI_NODE_COUNT);
            _startPoint = _chainsToRun-per_node;
            leftover    = _chainsToRun-per_node*MPI_NODE_COUNT;
            
            from          = 0;
            to            = per_node + (leftover>0);
            node_ranges   = {MPI_NODE_COUNT,2};
            
            for (node_id = 1; node_id < Min(_chainsToRun,MPI_NODE_COUNT); node_id += 1) {
                                        
                MPISend				(node_id, "_fileName = \"" + baseFilePath + "\"; start = " +from + ";end=" + to+";" + funcText); 
                
                
                node_ranges [node_id][0]         = from;
                node_ranges [node_id][1]         = to;
                
                from                             = to;
                to                              += per_node+(node_id<=leftover);  
            } 
        } else {
        _startPoint = 0;    
    }
        
    for (_r = _startPoint; _r < _chainsToRun; _r += 1){
        runMCMC (baseFilePath, _r);
    }
    
    fprintf         (intermediateHTML, CLEAR_FILE, progressPrefix, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 3 DONE]</b> Finished running the MCMC chains; drew ", _chainsToRun, "x", expected_samples, " samples from chains of length ", total, 
               " after discarding ", discard, " burn-in steps. Achieved throughput of ", Format(total/(Time(1)-time0),6,0) + " moves/sec.</DIV>");
   
    if (MPI_NODE_COUNT > 1 && points > MPI_NODE_COUNT) {
        for (node_id = 1; node_id < Min(_chainsToRun,MPI_NODE_COUNT); node_id += 1) {
            MPIReceive (-1,fromNode,res);
        }
    }
}

//------------------------------------------------------------------------------------------------//

function jointLogL (weights, alpha) {
    ll  = computeLogLFfromGridAndWeights (weights);
    dir = LogDrichletDensity (weights, alpha);
    return {{ll__, dir__}};
}


//------------------------------------------------------------------------------------------------//
 

function LogDrichletDensity (dir_weights, alpha) {
     if (Min(dir_weights, 0) <= 1e-10) {
        return -1e10;
     }
     if (alpha == 1) {
        return 0;
     }  
     dim = Columns (dir_weights);
     return  (+dir_weights["Log(_MATRIX_ELEMENT_VALUE_)*(alpha-1)"]+LnGamma(alpha*dim)-dim*LnGamma(alpha));
}

//------------------------------------------------------------------------------------------------//

function computeLogLFfromGridAndWeights (wts) {
    return +(((wts *(gridInfo["conditionals"]))["Log(_MATRIX_ELEMENT_VALUE_)"])+gridInfo["scalers"]);
}

//------------------------------------------------------------------------------------------------//

function siteLikelihoodsGivenWeights (wts) {
    return wts*(gridInfo["conditionals"]);
}

