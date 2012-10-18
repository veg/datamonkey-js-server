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