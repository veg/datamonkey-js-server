/* draw some amino acid neighborhood figures from site-wise codon frequencies

Wayne Delport
May 2010

1. map codons to amino acids
2. for each amino acid check that all observed codons are 1-step substitutable
	if true
		all codons for amino acid are one node
	else
		split codons into 1-step groups (eg Serine)
3. Find 1-step paths between all amino acid pairs
4. Are all amino acids connected?
	if false
		introduce a new amino acid
5. is the wildtype represented?
	if true
		end
	if false
		add wildtype and one-step lines
6. label wildtype, codon and amino acid frequencies
7. draw pretty picture

*/

function iterator ( key, value ) 
{
	return 
}

function 	storeProfile (recp&, string, value)
{
	for (h=0; h<Abs(string); h=h+1)
	{
		recp[string[h]] = value;
	}
	return 0;
}

function 	residueStyle (s,p,c)
{
	if (s == 1)
	{
		 color = "#B03060";
		 labelcolor = "#FFFFFF";
	}
	if (s == 2)
	{
		 color = "#00A86B";
		 labelcolor = "#000000";
	}
	if (s == 3)
	{
		 color = "#FF8C00";
		 labelcolor = "#000000";
	}
	if (s == 4)
	{
		 color = "#4B0082";
		 labelcolor = "#FFFFFF";
	}
	
	if (p == 0)
	{
		if (c == 0)
		{
			shape = "rect";
		}
		else
		{
			if (c == 1)
			{
				shape = "trapezium";
			}
			else
			{
				shape = "invtrapezium";
			}
		}
	}
	else
	{
		if (c == 0)
		{
			shape = "diamond";
		}
		else
		{
			if (c == 1)
			{
				shape = "triangle";
			}
			else
			{
				shape = "invtriangle";
			}
		}	
	}
	
	return " style=\"filled\" color=\"" + color + "\" fontcolor=\"" + labelcolor + "\" shape=\"" + shape + "\"";
}


polarity = {};
charge   = {};
stanfel	 = {};
	
storeProfile ("charge","RHK",1);
storeProfile ("charge","DE",-1);
storeProfile ("charge","ANCQGILMFPSTWYV",0);
	
storeProfile ("polarity","RNDCQEGHKSTY",1);
storeProfile ("polarity","AILMFPWV",0);
	
storeProfile ("stanfel","ACGILMPSTV",1);
storeProfile ("stanfel","DENQ",2);
storeProfile ("stanfel","FWY",3);
storeProfile ("stanfel","HKR",4);

ExecuteAFile("../Shared/HyPhyGlobals.ibf");

NUC_LETTERS = "ACGT";
CODONS = {64, 1};	
CodonMap = {};
for (i = 0; i < 64; i = i + 1)
{
	CODONS [i] = NUC_LETTERS[i$16] + NUC_LETTERS [(i%16)$4] + NUC_LETTERS [i%4];
	CodonMap [ NUC_LETTERS[i$16] + NUC_LETTERS [(i%16)$4] + NUC_LETTERS [i%4] ] = i;
}

AAMap 	= {"F":"0", "L":"1", "I":"2", "M":"3", "V":"4", "S":"5", 
			"P":"6", "T":"7", "A":"8", "Y":"9", "H":"10", "Q":"11", 
			"N":"12", "K":"13", "D":"14", "E":"15", "C":"16", 
			"W":"17", "R":"18", "G":"19"};

AAToAlphabetOrder = { { 4, 9, 7, 10, 17, 15, 12, 16, 0, 19, 6, 13, 11, 8, 2, 3, 1, 18, 14, 5 } };
					 /*	F  L  I   M   V   S   P   T  A   Y  H   Q  N   K  D  E  C   W   R  G */ 
					 
fscanf	(stdin, "String", filePrefix);
fscanf  (stdin, "Number", site );
fscanf  (stdin, "String", wildtype );
fscanf  (stdin, "Number", genCodeID );

site = site - 1;

skipCodeSelectionStep = 1;
ExecuteAFile		("../Shared/chooseGeneticCode.def");
ApplyGeneticCodeTable ( genCodeID );

ExecuteAFile		("../Shared/_MSCOneStep.ibf" );
ExecuteAFile		("../Shared/ReadDelimitedFiles.bf" );

inFile = BASE_CLUSTER_ACCESS_PATH + filePrefix;
DataSet ds = ReadDataFile (inFile);
DataSetFilter filteredData = CreateFilter (ds,3,"","",GeneticCodeExclusions);

filterString = "";
filterString = filterString + ((site)*3) + "-" + ((site)*3 + 2);
DataSetFilter siteCodonFilter = CreateFilter (ds,3,filterString,"",GeneticCodeExclusions );


/* this will give 64x1 codon counts*/
/*
GetDataInfo (chars, siteCodonFilter, "CHARACTERS");
senseChars = Columns(chars);
codonSiteProfile = {senseChars,1};

for (i = 0; i < siteCodonFilter.species; i = i + 1)
{
	GetDataInfo (res, siteCodonFilter, i, 0);
	howManyChars = (Transpose(res["1"]) * res)[0];
	
	if (howManyChars > 0 && howManyChars < senseChars)
	{
		codonSiteProfile = codonSiteProfile + res;
	}
}
*/

HarvestFrequencies(codonSiteProfile,siteCodonFilter,3,3,0);


WildAACode = 0 + AAMap [ wildtype ];
GraphArray = {};
ashift = 0;
for ( aa = 0; aa < 20; aa = aa + 1 ) { /*order as in Genetic Code, skipping 10*/
	islands = 1;
	cc = 0;
	hshift = 0;
	for ( h = 0; h < 64; h = h + 1 ) {
		if ( _Genetic_Code [ h ] != 10 ) {
			aacode = _Genetic_Code [ h ];
			if (aacode > 10) {aacode = aacode - 1;}
			if (aacode  == aa ) {
				/*if ( codonSiteProfile [h] > 0 ) {*/
					if ( cc == 0 ) {
						stringName = "" + aacode + "_0";
						addString = "0," + h;
						GraphArray[stringName] = addString;
						if ( WildAACode == aacode ) {
							gotWild = 1;
						}
						cc = cc + 1;
					}
					else {
						stringName = "" + aacode + "_0";	
						getString = "" + GraphArray[stringName];
						cod = splitOnRegExp ( getString, "," );
						dc = 1;
						onestep = 0;
						while ( ( dc < Abs ( cod ) ) && ( onestep == 0) ) {
							v = 0 + cod [ dc ];
							diff = Abs(v-h);
							if ((h$4==v$4)||((diff%4==0)&&(h$16==v$16))||(diff%16==0)) {
								onestep = 1;										
							}
							dc = dc + 1;
						}
						if ( onestep ) {
							addString = getString + "," + h;
							GraphArray[stringName] = addString;
						}
						else {
							stringName = "" + aacode + "_1";
							if ( islands == 1 ) { /*create new 2nd island*/
								addString = "1," + h;
								GraphArray[stringName] = addString;
								islands = islands + 1;
							}
							else { /*add to 2nd island*/
								getString = "" + GraphArray[stringName];		
								addString = getString + "," + h;
								GraphArray[stringName] = addString;
							}		
						}
						cc = cc + 1;
					}		
				/*}	*/
			}
		}
		else {
			hshift = hshift + 1;
		}
	}
}

/*Graph Array contains amino acid nodes in format {"AACode": "island_number,codon1,codon2, ..."}*/


fontSizeBig= 24;
fontSizeSmall = 16;
penWidth = 1;
codonStyle = "filled";
codonShape = "circle";

graphString = "";
graphString * 1024;
graphString * ( "graph G{remincross=\"true\" rankdir=\"TB\" size=\"8,8\";\n" );
graphString * ( "node [shape=record];\n" );

keys = Rows ( GraphArray );

for ( i = 0; i < Abs ( GraphArray ); i = i + 1 ) {
	GString = GraphArray [keys[i]];
	cod = splitOnRegExp ( GString, "," );
	AALabel = "" + defaultAAOrdering [ 0+( splitOnRegExp ( keys [ i ], "_" ))[0]];
	ClusterLabel = AALabel;
	if ( AALabel == wildtype ) {
		ClusterLabel = ClusterLabel + "_wt";
	}
	if ( ( splitOnRegExp ( keys [ i ], "_" ))[1] == "1" ) {
		ClusterLabel = ClusterLabel + "_alt";
	}
	graphString * ( "\nsubgraph cluster_" + ClusterLabel + "{color = white;\n" );
	graphString * ( "struct_" + i + "[label =\"" ); 
	
	for ( j = 1; j < Abs ( cod ); j = j + 1 ) {
		idx = 0 + cod [ j ];
		NodeLabel =  "" + CODONS [ idx ];
		if ( codonSiteProfile [ idx ] > 0 ) {
			NodeLabelFreq = NodeLabel +"\ (" + codonSiteProfile [ idx ] +  ")";
		}
		else {
			NodeLabelFreq = NodeLabel;
		}
		if ( j == 1 ) {
			graphString * ( "<s" + i + ">" + ClusterLabel + ":" + NodeLabelFreq );
		}
		else {
			graphString * ( " " + NodeLabelFreq + " " );
		}
	}
	if ( AALabel == wildtype ) {
		graphString * ( "\" color=\"green\"];\n" );
	}
	else {
		if ( isOneStepSub [ 0+AAMap[AALabel] ][ 0+AAMap[wildtype] ] ) {
			graphString * ( "\" color=\"blue\"];\n" );
		}
		else {
			graphString * ( "\" color=\"red\"];\n" );
		}
	}
	graphString * ( "}" );
}
/* connect the subgraphs or rather elements of the record*/

for ( i = 0; i < Abs ( GraphArray ); i = i + 1 ) {
	
	AALabel = "" + defaultAAOrdering [ 0+( splitOnRegExp ( keys [ i ], "_" ))[0]];
	ClusterLabel = "cluster_" + AALabel;
	if ( AALabel == wildtype ) {
		ClusterLabel = ClusterLabel + "_wt";
	}
	if ( ( splitOnRegExp ( keys [ i ], "_" ))[1] == "1" ) {
		ClusterLabel = ClusterLabel + "_alt";
	}
	GString = GraphArray[keys[i]];
	cod = splitOnRegExp ( GString, "," );
	
	for ( j = i+1; j < Abs ( GraphArray ); j = j + 1 ) {
		AALabel2 = "" + defaultAAOrdering [ 0+( splitOnRegExp ( keys [ j ], "_" ))[0]];	
		ClusterLabel2 = "cluster_" + AALabel2;
		if ( AALabel2 == wildtype ) {
			ClusterLabel2 = ClusterLabel2 + "_wt";
		}
		if ( ( splitOnRegExp ( keys [ j ], "_" ))[1] == "1" ) {
			ClusterLabel2 = ClusterLabel2 + "_alt";
		}
		GString2 = GraphArray[keys[j]];
		cod2 = splitOnRegExp ( GString2, "," );
			
		accessible = 0;
		c1 = 1;
		while ( c1 < Abs ( cod ) && accessible == 0 ) {
			testCodon = 0 +  cod [ c1 ];
			c2 = 1;
			while ( c2 < Abs ( cod2 ) ) {
				testCodon2 = 0 + cod2 [ c2 ];
				diff = testCodon2 - testCodon;
				if ( ( testCodon$4 == testCodon2$4 ) || ( ( ( diff%4 ) == 0 ) && ( testCodon$16==testCodon2$16 )) || (diff%16==0) )  {  
					accessible = 1;
				}
				c2 = c2 + 1;
			}
			c1 = c1 + 1;
		}
		
		if ( accessible ) {
			if ( AALabel == wildtype || AALabel2 == wildtype ) {
				graphString * ( "\n" + "struct_" + i + ":s" + i + " -- " + "struct_" + j + ":s" + j + " [color = \"green\" style=\"solid\"];\n" );
			}
			else {
				graphString * ( "\n" + "struct_" + i + ":s" + i + " -- " + "struct_" + j + ":s" + j + " [style=\"dashed\"];\n" );
			}
		}
		
	}

}


graphString * ( "\n}" );
graphString * 0;

fprintf ( stdout, graphString, "\n" );
