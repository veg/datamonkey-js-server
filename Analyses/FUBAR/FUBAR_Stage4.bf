RequireVersion  ("2.11");

fscanf  			(stdin,"String", _in_FilePath);
fscanf              (stdin,"Number", _in_PosteriorProb);
fscanf              (stdin,"Number", _in_TreeMode);
fscanf              (stdin,"Number", _chainCount);
fscanf              (stdin,"Number", _in_GeneticCodeTable);

skipCodeSelectionStep    = 1;
ExecuteAFile			("../Shared/chooseGeneticCode.def");
ApplyGeneticCodeTable (_in_GeneticCodeTable);


ExecuteAFile        (PATH_TO_CURRENT_BF + "FUBAR_tools.ibf");
LoadFunctionLibrary ("GrabBag");

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalPHP            = baseFilePath + ".out";

grid_file   = baseFilePath + ".grid_info";

ExecuteAFile (baseFilePath + ".nucFit");

sequences = nucData_1.species;

GetInformation (treeCount,"^nuc_tree_[0-9]+$");
fileCount       = Columns (treeCount);
treeLengths     = {fileCount,1};

for (fileID = 1; fileID <= fileCount; fileID += 1)
{
	treeLengths [fileID-1] = + Eval("BranchLength(nuc_tree_"+fileID+",-1)");
}

fscanf (grid_file, "NMatrix,Raw", grid, site_probs);
site_probs = Eval (site_probs);


readMCMCSamples (baseFilePath,_chainCount);

sites   = Columns (site_probs["conditionals"]);

fprintf (intermediateHTML, "<DIV class = 'RepClassSM'><b>[PHASE 4]</b> Processing ", samples, " samples from each of the ", _chainCount, " chains on a ", points, "-point grid for a dataset with ", sites, " sites and ", sequences, " sequences.</DIV>");


notPositiveSelection = {points,1} ["grid[_MATRIX_ELEMENT_ROW_][0]>=grid[_MATRIX_ELEMENT_ROW_][1]"];
nonPositiveCount     = +notPositiveSelection;

priorMean            = {1, points};
sampleFromThisDistro = {nonPositiveCount,2};

tabulateGridResults (points, sites, samples, _chainCount);

from = 0;
for (_point = 0; _point < points; _point += 1) {
    priorMean [_point] = (+jointSamples[-1][_point])/samples;
    if (notPositiveSelection [_point]) {
        sampleFromThisDistro [from][0] = _point;
        sampleFromThisDistro [from][1] = priorMean [_point];
        from += 1;
    }
}

simPatterns = Random(sampleFromThisDistro, {"PDF":"Multinomial","ARG0":1000});

sample_file = baseFilePath + ".samples";
fprintf (sample_file, CLEAR_FILE, jointLogL, "\n", jointSamples);

fprintf (finalPHP, CLEAR_FILE);
posSelected = 0; negSelected = 0;
reportSiteResults (sites, 1,"posSelected","negSelected",_in_PosteriorProb);
fscanf (finalPHP, "Raw", site_results);

posteriorsUnderNN = {1,1};

/*fprintf (intermediateHTML, "<DIV class = 'RepClassSM'><b>[PHASE 5]</b> Performing 1,000 simulations under the data-derived composite null model to derive False Discovery rate estimates</DIV>");
ExecuteAFile (PATH_TO_CURRENT_BF + "FUBAR_Stage5.bf");*/

fprintf (finalPHP, CLEAR_FILE, KEEP_OPEN, _in_PosteriorProb, "\n", _in_TreeMode, "\n", treeLengths, "\n", +(sampleFromThisDistro[-1][1]), "\n", posteriorsUnderNN, "\n",
        "Site,alpha,beta,dn_minus_ds,post_pos_sel,post_neg_sel,psr,neff,within,between,var_est", site_results);

fprintf (finalPHP, CLOSE_FILE);
fprintf (intermediateHTML,CLEAR_FILE, "DONE");


timeStamp = baseFilePath + ".time";
fscanf      (timeStamp, "Number", initial_time);

GetString 			(time_info, TIME_STAMP, 1);
fprintf 			("usage.log",time_info[0][Abs(time_info)-2],",",sequences,",",sites,",",Time(1)-initial_time, ",", posSelected,",",negSelected,",",_in_PosteriorProb,"\n");

