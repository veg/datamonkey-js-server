RequireVersion  ("2.11");

fscanf  			(stdin,"String", _in_FilePath);

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";

LoadFunctionLibrary ("GrabBag");

gridFile = baseFilePath + ".grid_info";
fscanf (gridFile, REWIND, "NMatrix,Raw", grid, gridInfo);
gridInfo = Eval(gridInfo);

points = Rows(grid);
sites  = Columns(gridInfo["conditionals"]);

weights = {1,points}["Random(0,1)"];
weights = weights * (1/(+weights));


_concentration_parameter = 0.3;

currentSiteLikelihoods = siteLikelihoodsGivenWeights (weights);
currentSiteLogSum      = +(currentSiteLikelihoods["Log(_MATRIX_ELEMENT_VALUE_)"]);
currentLogL            = jointLogL (weights, _concentration_parameter);
individualGridPointContribs = {};

for (k = 0; k < points; k+=1) {
    individualGridPointContribs [k] = (gridInfo["conditionals"])[k][-1];
}



total                  = 5000000;
contracting            = total$10;
discard                = total$5;
sample                 = (total-discard)$1000;

expected_samples     = (total-discard)$sample;
sampled_weights      = {expected_samples,points};
sampled_likelihoods  = {1,expected_samples};

time0                = Time(1);
sample_index         = 0;


fprintf         (intermediateHTML, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 3]</b> Running an MCMC chain to obtain a posterior sample of grid point weights: ", total, " total steps, of which ",
                                    discard, " will be discarded as burn-in, and sampling every ", sample, " steps.</DIV>");
                                    
fscanf          (intermediateHTML, "Raw", progressPrefix);


baselineStep         = 2;
reductionFactor      = 0.9;

accepted_steps = 0;

for (steps = 0; steps < total; steps += 1) {  
        
    idx    = Random (0, points)$1;
    idx2   = Random (0, points)$1;
    while (idx == idx2) {
        idx2   = Random (0, points)$1;     
    }
    
    if ((i+1) % contracting == 0) {
        baselineStep = baselineStep*reductionFactor;
    }
    
    change = Random (0,baselineStep/sites);
    
    if (weights[idx] > change) {
    
        diffVector          = individualGridPointContribs[idx2]*change-individualGridPointContribs[idx]*change;
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
    
    if (steps >= discard) {
        if ((steps - discard) % sample == 0) {
            for (dd = 0; dd < points; dd += 1) {
                sampled_weights[sample_index][dd] = weights[dd];
            }
            sampled_likelihoods[sample_index] = currentLogL[0];
            sample_index += 1;
        }
    } 

    if (steps % sample == 0) {
 	    fprintf         (intermediateHTML, CLEAR_FILE, progressPrefix, "<DIV class = 'RepClassSM'> MCMC progress <DL><DT class = 'DT1'>Current log(L): "+currentLogL[0] +"</DT><DT class = 'DT2'>" + Format((steps+1)/(Time(1)-time0),6,0) + " moves/sec </DT><DT class = 'DT1'> Sampled states: " + steps + "</DT><DT class = 'DT2'>Acceptance ratio: " + Format(accepted_steps/total,4,2) + "</DT><DL></DIV>");   
    }
}

fprintf         (intermediateHTML, CLEAR_FILE, progressPrefix, "\n<DIV CLASS = 'RepClassSM'><b>[PHASE 3 DONE]</b> Finished running MCMC chain; drew ", expected_samples, " samples from a chain of length ", total, 
            " after discarding ", discard, " burn-in steps. Achieved throughput of ", Format(total/(Time(1)-time0),6,0) + " moves/sec.</DIV>");

mcmcfile = baseFilePath + ".samples";
fprintf (mcmcfile,CLEAR_FILE, sampled_likelihoods, "\n\n", sampled_weights);

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


