ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/DBTools.ibf");
ExecuteAFile	("../Shared/PS_Plotters.bf");

fscanf		(stdin,"String", filePrefix);
fscanf		(stdin,"Number", res1);
fscanf		(stdin,"Number", res2);

slacDBID			= _openCacheDB      (filePrefix);

generalInfo			= _ExecuteSQL  (slacDBID,"SELECT * FROM CREDIBLEMODELS_RATES WHERE (RESIDUE_IDX1=" + res1 + " AND RESIDUE_IDX2=" + res2 + ")" );

/*fprintf ( stdout, generalInfo );*/

rowCount			= Abs(generalInfo);
rateArray			= {rowCount,1};

fieldLookup = "SUBS_RATE";
for ( r = 0; r < rowCount; r =r+1 ) {
	rateArray[r] = 0 + (generalInfo[r])[fieldLookup];
}


/*fprintf ( stdout, rateArray, "\n" );
return 0;
*/

rgb_colors	= { { 0, 0, 255 } };
fig_size	= { { 400, 400, 12 } };

aminoacidOrdering = "FLIMVSPTAYHQNKDECWRG";
aa1 = "" + aminoacidOrdering[res1];
aa2 = "" + aminoacidOrdering[res2];
plot_title = "" + aa1 + "-" + aa2;

/*fprintf ( stdout, plot_title, "\n" );*/

plot_legend = { { plot_title, plot_title + " substitution rate", "Frequency" } };

fprintf ( stdout, PSHistogram (rateArray,-1,1,arial,fig_size,rgb_colors,plot_legend,1) );

