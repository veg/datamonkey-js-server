ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/GrabBag.bf");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/DBTools.ibf");


fscanf		(stdin,"String", filePrefix);
fscanf 		(stdin, "Number", site );
fscanf		(stdin,"String", wildtype);

slacDBID = _openCacheDB (filePrefix);

generalInfo = _ExecuteSQL  (slacDBID,"SELECT * FROM FILE_INFO");
/*fprintf ( stdout, generalInfo, "\n" );*/

nPartitions 	= 0+(generalInfo[0])["Partitions"];
genCodeID		= 0+(generalInfo[0])["genCodeID"];

skipCodeSelectionStep = 1;
ExecuteAFile		("../Shared/chooseGeneticCode.def");
ApplyGeneticCodeTable ( genCodeID );

ExecuteAFile	("../Shared/_MSCOneStep.ibf");

aminoacidOrdering = "FLIMVSPTAY*HQNKDECWRG"; 
mapAAToIdx = {};
for ( i = 0; i < 21; i = i + 1 ) {
	ExecuteCommands ( "mapAAToIdx[\"" + aminoacidOrdering[i] + "\"] = " + i + ";" ); 
}
ExecuteCommands ( "aaIdx = 0 + mapAAToIdx[\"" + wildtype + "\"];" );

codonToAAMap = {};	
nucChars = "ACGT";
for (p1=0; p1<64; p1=p1+1)
{
	codon = nucChars[p1$16]+nucChars[p1%16$4]+nucChars[p1%4];
	ccode = _Genetic_Code[p1];
	codonToAAMap[codon] = ccode;
}
codonToAAMap["---"] = -9;

if ( nPartitions <= 1 ) {
	treeS = (generalInfo[0])["NJ"];
	Tree t = treeS;
	
	inFile = BASE_CLUSTER_ACCESS_PATH + filePrefix;
	DataSet ds = ReadDataFile (inFile);
	DataSetFilter filteredData = CreateFilter (ds,3,"","",GeneticCodeExclusions);
	filterString = "";
	filterString = filterString + (site-1)*3 + "-" + ((site-1)*3 + 2);
	
	/*fprintf ( stdout, filterString, "\n" );*/
	ExecuteCommands ( "DataSetFilter siteFilter = CreateFilter (ds,3,\"" + filterString + "\",\"\",GeneticCodeExclusions);" );
	
	GetString(seqNames, siteFilter, -1);
	GetInformation ( codonSequences, siteFilter );
	
	TREE_OUTPUT_OPTIONS = {};
	TREE_OUTPUT_OPTIONS [ "TREE_OUTPUT_LAYOUT" ] = 0;
	TREE_OUTPUT_OPTIONS	[ "TREE_OUTPUT_BACKGROUND" ] = {{1,1,1}};
	
	for ( j = 0; j < siteFilter.species; j = j + 1 ) {
		seqString = codonSequences[j];
		if ( ( codonToAAMap[seqString] != "-9" ) && ( aaIdx != codonToAAMap[seqString] ) ) {
			if ( isOneStepSub [ aaIdx ][ codonToAAMap[seqString]] ) { /* one step */
				bcolor = "0,0,1"; /*blue*/ 
			}
			else { /* multi-step */
				bcolor = "1,0,0"; /*red*/
			}
		}
		if ( aaIdx == codonToAAMap[seqString] ) {	/*green*/
			bcolor = "0,1,0";
		}
		
		tlabel = "";
		tlabel = seqNames[j];
		ExecuteCommands ( "TREE_OUTPUT_OPTIONS [ \"" + tlabel + "\" ] = {};" );
		ExecuteCommands ( "(TREE_OUTPUT_OPTIONS [ \"" + tlabel + "\" ])[\"TREE_OUTPUT_BRANCH_COLOR\"] = {{" + bcolor + "}};" );
		/* change branch label to label with (codon) */
		/*ExecuteCommands ( "(TREE_OUTPUT_OPTIONS [ \"" + tlabel + "\" ])[\"TREE_OUTPUT_BRANCH_LABEL\"] = " + tlabel + "(" + seqString + ");" );	*/	
	}
}
else {
	/* get the tree for each partition. where? depends on treemode */

}
treeString = PSTreeString ( t, "STRING_SUPPLIED_LENGTHS",{{-1,-1}});
fprintf ( stdout, treeString );

_closeCacheDB (slacDBID);


