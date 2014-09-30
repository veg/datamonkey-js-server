ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/GrabBag.bf");

skipCodeSelectionStep = 1;
ExecuteAFile    ("../Shared/chooseGeneticCode.def");

fscanf ( stdin, "String", _in_FilePath );
fscanf ( stdin, "Number", genCodeID);

ApplyGeneticCodeTable (genCodeID);

filePathInfo = splitFilePath (_in_FilePath);
jobID = filePathInfo["FILENAME"] + "." + filePathInfo["EXTENSION"];

customrefFile = _in_FilePath + ".config";

DataSet 	ds 	=  ReadDataFile (_in_FilePath);

if (ds.species > 0) {
    
    referenceNameArray		 = {ds.species,1};
    referenceSequenceArray 	 = {ds.species,1};
    
    DataSetFilter nucFilter = CreateFilter (ds,1);
    GetInformation ( sequences, nucFilter );
    GetString 	   ( taxonNames, nucFilter, -1 );
    
    alreadyDone = {};
    
    for ( i = 0; i <  ds.species; i += 1 ) {
        notrailers = sequences[i] ^ {{"\\?",""}};
        taxonNames[i] = normalizeSequenceID (taxonNames[i], "alreadyDone");
        DataSet       thisSequence = ReadFromString (">" + taxonNames[i] + "\n" + notrailers);
        DataSetFilter filteredData = CreateFilter (ds,3, "", "", GeneticCodeExclusions);
        GetInformation (thisSequenceData, filteredData);
        if (filteredData.sites < thisSequence.sites $ 3) {
            defaultErrorOut ("'" + taxonNames[i] + "' appears to have stop codons.");
            return 0;
        }
        
        if (filteredData.sites > 2000) {
            defaultErrorOut ("'" + taxonNames[i] + "' is longer than the currently allowed limit of 6,000 bp.");
            return 0;        
        }
       
        referenceNameArray [ i ] = taxonNames [ i ];
        referenceSequenceArray [ i ] = thisSequenceData [ 0 ];
    }
    

    fprintf ( customrefFile, CLEAR_FILE, referenceNameArray, " ", referenceSequenceArray, "\n" );
}
