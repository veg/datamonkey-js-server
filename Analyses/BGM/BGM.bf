RequireVersion  ("0.9920060815");

/* ________________________________________________________________	*/

function make_discrete_node (node_id, sample_size, max_parents)
{
	dnode = {};
	dnode["NodeID"] = "Node" + node_id;
	dnode["NodeType"] = 0;
	dnode["NumLevels"] = 2;
	dnode["PriorSize"] = sample_size;
	dnode["MaxParents"] = max_parents;
	return dnode;
}

function make_continuous_node (node_id, sample_size, mean, precision)
{
	cnode = {};
	cnode["NodeID"] 	= "Node" + node_id;
	cnode["NodeType"] = 1;
	cnode["PriorSize"] 	= sample_size;
	cnode["MaxParents"] = max_parents;
	cnode["PriorMean"]	= mean;
	cnode["PriorVar"]	= precision;
	return cnode;
}

function make_banned_edge (parent, child)
{
	a_rule = {};
	a_rule["BanParent"] = parent;
	a_rule["BanChild"] = child;
	return a_rule;
}

discreteNodes = {};
continuousNodes = {};
banlist = {};

/* BGM_NTHREADS = 2; */


/* ________________________________________________________________	*/

ExecuteAFile("../Shared/globals.ibf");

fscanf 				(stdin, "String", _in_FilePath);
fscanf 				(stdin, "Number", _in_pvalue);
baseFilePath  		= "spool/"+_in_FilePath;
intermediateHTML	= baseFilePath + ".progress";
finalPHP			= baseFilePath + ".out";
fprintf 			(finalPHP, CLEAR_FILE,_in_pvalue);
fprintf 			(intermediateHTML, CLEAR_FILE);
GetURL 				(analysisSpecRaw,BASE_URL_PREFIX+MANGLED_PREFIX+"/"+_in_FilePath+".bgm");
sscanf				(analysisSpecRaw,"Number,NMatrix,NMatrix",num_parents,site_map,bgm_data_matrix);
//fscanf ("test.txt", "Number,NMatrix,NMatrix",num_parents,site_map,bgm_data_matrix);

timer = Time(1);

num_parents = num_parents$1;
num_nodes   = Columns (bgm_data_matrix);


SAVE_OPT_STATUS_TO  = BASE_CLUSTER_DIR + "Analyses/BGM/" + intermediateHTML;

for (k = 0; k < num_nodes; k = k+1)
{
	discreteNodes[Abs(discreteNodes)] = make_discrete_node (k, 0, num_parents);
}


BGM_MCMC_MAXSTEPS 	= 100000;
BGM_MCMC_BURNIN		= BGM_MCMC_MAXSTEPS $ 10;
BGM_MCMC_SAMPLES 	= BGM_MCMC_MAXSTEPS $ 1000;


BayesianGraphicalModel gen_bgm = 		(discreteNodes);
SetParameter 		(gen_bgm, BGM_DATA_MATRIX, 	 bgm_data_matrix);
BGM_OPTIMIZATION_METHOD = 4;

Optimize 	(postp, gen_bgm);

/* output edge posteriors */
nvar = Abs		(discreteNodes);
nobs = Rows 	(bgm_data_matrix);

edgeSupport = {nvar,nvar} ["postp[_MATRIX_ELEMENT_ROW_*nvar+_MATRIX_ELEMENT_COLUMN_][1]"];

fprintf (finalPHP, "\n", num_parents, "\n", site_map, "\n", edgeSupport, "\n", postp[{{0,0}}][{{BGM_MCMC_SAMPLES-1,0}}]);


fprintf (intermediateHTML,CLEAR_FILE,"DONE");
GetString (HTML_OUT, TIME_STAMP, 1);
fprintf ("usage.log",HTML_OUT[0][Abs(HTML_OUT)-2],",",num_parents,",",nobs,",",nvar,",",Time(1)-timer,"\n");
