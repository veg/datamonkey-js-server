RequireVersion  ("2.11");

fscanf  			(stdin,"String", _in_FilePath);
fscanf              (stdin,"Number", _in_PosteriorProb);
fscanf              (stdin,"Number", _in_TreeMode);

baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalPHP            = baseFilePath + ".out";

sample_file = baseFilePath + ".samples";
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

fscanf (sample_file, "NMatrix,NMatrix", logL, sampled);
fscanf (grid_file, "NMatrix,Raw", grid, site_probs);


site_probs = Eval (site_probs);
samples = Rows (sampled);
points  = Columns (sampled);
sites   = Columns (site_probs["conditionals"]);

alphas   = {1,points}["grid[_MATRIX_ELEMENT_COLUMN_][0]"];
betas    = {1,points}["grid[_MATRIX_ELEMENT_COLUMN_][1]"];

fprintf (intermediateHTML, "<DIV class = 'RepClassSM'><b>[PHASE 4]</b> Processing ", samples, " samples on a ", points, "-point grid for a dataset with ", sites, " sites and ", sequences, " sequences.<DIV>");

positive_selection_stencil = {1,points} ["grid[_MATRIX_ELEMENT_COLUMN_][0]<grid[_MATRIX_ELEMENT_COLUMN_][1]"];
negative_selection_stencil = {1,points} ["grid[_MATRIX_ELEMENT_COLUMN_][0]>grid[_MATRIX_ELEMENT_COLUMN_][1]"];

fprintf (finalPHP, CLEAR_FILE, KEEP_OPEN, _in_PosteriorProb, "\n", _in_TreeMode, "\n", treeLengths, "\n",
        "Site,alpha_mean,alpha_median,alpha_25,alpha_975,beta_mean,beta_median,beta_25,beta_975,dn_minus_ds_mean,dn_minus_ds_median,dn_minus_ds_25,dn_minus_ds_975,post_pos_sel_mean,post_pos_sel_median,post_pos_sel_5,post_neg_sel_95,post_neg_sel_mean,post_neg_sel_median,post_neg_sel_5,post_neg_sel_95");

negSelected = 0;
posSelected = 0;

for (s = 0; s < sites; s += 1) {
    site_conditionals = Transpose((site_probs["conditionals"])[-1][s]);
    dist      = {samples,4};
    for (p = 0; p < samples; p+=1) {
        localP = site_conditionals$(sampled[p][-1]);
        localP = localP * (1/(+localP));
        dist[p][2] = +(localP$positive_selection_stencil);
        dist[p][3] = +(localP$negative_selection_stencil);
        dist[p][0] = +(alphas$localP);
        dist[p][1] = +(betas$localP);
    }
    
    posInfo = print_4_num(dist[-1][2],0.05,0.95);
    if (mean >= _in_PosteriorProb) {
        posSelected += 1;
    }
    negInfo = print_4_num(dist[-1][3],0.05,0.95);
     if (mean >= _in_PosteriorProb) {
        negSelected += 1;
    }
   
    fprintf (finalPHP, "\n", s+1, ",", Join(",",{{print_4_num(dist[-1][0],0.025,0.975),print_4_num(dist[-1][1],0.025,0.975),print_4_num(dist[-1][1] - dist[-1][0],0.025,0.975),posInfo,negInfo}}));
}
fprintf (finalPHP, CLOSE_FILE);
fprintf (intermediateHTML,CLEAR_FILE, "DONE");


timeStamp = baseFilePath + ".time";
fscanf      (timeStamp, "Number", initial_time);

GetString 			(time_info, TIME_STAMP, 1);
fprintf 			("usage.log",time_info[0][Abs(time_info)-2],",",sequences,",",sites,",",Time(1)-initial_time, ",", posSelected,",",negSelected,",",_in_PosteriorProb,"\n");

function print_4_num (vector,lowb,upperb) {
    vector = vector % 0;
    dim = Rows (vector);
    mean = (+vector)/dim;
    if (dim % 2) {
        median = vector[dim$2];
    } else {
        median = .5*(vector[dim$2]+vector[dim$2-1]);
    }
    lb = vector[dim*lowb$1];
    ub = vector[dim*upperb$1];
    
    return Join(",",{{mean__,median__,lb__,ub__}});
}