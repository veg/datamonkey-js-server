options = {"0":"/home/datamonkey/Datamonkey/Analyses/UDS/spool//upload.500325077214814.1_uds.gag_121_270.fas.90.sim",
"1":"HKY85",
"2":"Global",
"3":"/home/datamonkey/Datamonkey/Analyses/UDS/spool//upload.500325077214814.1_uds.gag_121_270.fas.90.sim.tree"
};

ExecuteAFile (HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"AnalyzeNucProtData.bf",options,"sim");





aaScoreString = "HIV 5%";

LoadFunctionLibrary ("chooseGeneticCode", {"0" : "Universal"});

skipCodeSelectionStep = 1;

ExecuteAFile ("454_region_extract.bf",
{"00":"/home/datamonkey/Datamonkey/Analyses/UDS/spool//upload.632718513313869.1_uds.env.cache",
"01":"0",
"02":"Nucleotide",
"03":"No",
"04":"401",
"05":"550",
"06":"Proportion",
"07":"0.01",
"10":"/home/datamonkey/Datamonkey/Analyses/UDS/spool//upload.632718513313869.1_uds.envmax_401_550.fas",
"08":"No"});
