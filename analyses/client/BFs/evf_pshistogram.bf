ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/DBTools.ibf");
ExecuteAFile	("../Shared/PS_Plotters.bf");

fscanf		(stdin,"String", filePrefix);
fscanf		(stdin,"Number", site);

slacDBID			= _openCacheDB      (filePrefix);
generalInfo			= _ExecuteSQL  (slacDBID,"SELECT SAMPLES FROM EVF_POSTERIOR_SAMPLES WHERE (CODON=\"" + site + "\")" );
ExecuteCommands 	("posteriors="+generalInfo[0]);

posteriors = Log (posteriors);
rgb_colors	= { { 0.5, 0, 0.5 } };
fig_size	= { { 500, 500, 12 } };

plot_title = "Log(Bayes Factor) for Positive Selection at codon " + site;

/*fprintf ( stdout, plot_title, "\n" );*/

plot_legend = { { plot_title, plot_title, "Frequency" } };

fprintf ( stdout, PSHistogram (posteriors,-1,1,arial,fig_size,rgb_colors,plot_legend,1) );

