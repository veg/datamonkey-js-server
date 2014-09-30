skipCodeSelectionStep = 1;

ExecuteAFile	("../Shared/HyPhyGlobals.ibf");
ExecuteAFile	("../Shared/ReadDelimitedFiles.bf");
ExecuteAFile	("../Shared/GrabBag.bf");
ExecuteAFile 	("../Shared/chooseGeneticCode.def");
ExecuteAFile("../Shared/hiv_1_ref_sequences.ibf");

fscanf ( stdin, "Number", referenceSeq );
fscanf ( stdin, "Number", mode );
fscanf ( stdin, "Number", gencode );

ApplyGeneticCodeTable (gencode);
NUC_LETTERS		= "ACGT";

if ( mode ) {
	codonMap = {};
	for (p1=0; p1<64; p1=p1+1)
	{
		codon = NUC_LETTERS[p1$16]+NUC_LETTERS[p1%16$4]+NUC_LETTERS[p1%4];
		ccode = _Genetic_Code[p1];
		codonMap[codon] = _hyphyAAOrdering[ccode];
	}
	fprintf ( stdout, translateCodonToAA ( RefSeqs[referenceSeq], codonMap, 0 ), "\n" );
}
else {
	fprintf ( stdout, RefSeqs[referenceSeq], "\n" );
}