/*
aRecord = {"TABLE":"SEQUENCES",
		   "FIELD_NAME":"REF_PASS2",
		   "DESCRIPTION":""};
*/

ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"GrabBag.bf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DBTools.ibf");
ExecuteAFile 					(HYPHY_LIB_DIRECTORY+"TemplateBatchFiles"+DIRECTORY_SEPARATOR+"Utility"+DIRECTORY_SEPARATOR+"DescriptiveStatistics.bf");

if ( DO_PIPELINE ) {
	skipCodeSelectionStep = 1;
	ExecuteAFile	("../Shared/chooseGeneticCode.def");
	fscanf ( stdin, "Number", _local_GeneticCodeTable );
	ApplyGeneticCodeTable ( _local_GeneticCodeTable );
}
else {
	ExecuteAFile	("../Shared/chooseGeneticCode.def");
}

AALetters						= "ACDEFGHIKLMNPQRSTVWY?-";
NucLetters						= "ACGT-N";
AAMap							= {};

for (k = 0; k < Abs (AALetters); k=k+1)
{
	AAMap[AALetters[k]] = k;
}

codonStrings 	  = {};
codonStringToCode = {};

for (k = 0; k < 64; k = k+1)
{
	if (_Genetic_Code[k] != 10)
	{
		k2 = Abs(codonStrings);
		codonStrings[k2] = codeToCodon (k);
		codonStringToCode [codonStrings[k2]] = k2+1;
	}
}

alphCharCount			= Abs(codonStrings);


DBID					= _openCacheDB ("");
DB_FILE_PATH 			= LAST_FILE_PATH;

tableInfo					= {};
tableInfo["TABLE_NAME"]			= "TEXT";
tableInfo["FIELD_NAME"]			= "TEXT";
tableInfo["DESCRIPTION"]		= "TEXT";
_CheckDBID ( DBID, "LEGEND", tableInfo );

/*AA_ALIGNMENT*/
aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
aRecord["FIELD_NAME"]			= "POSITION";
aRecord["DESCRIPTION"]		= "Amino acid position with respect to reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
aRecord["FIELD_NAME"]			= "INDEL_POSITION";
aRecord["DESCRIPTION"]		= "Flag for whether position is an indel in the reference (0/1:No/Yes)";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
aRecord["FIELD_NAME"]			= "COVERAGE";
aRecord["DESCRIPTION"]		= "Coverage (depth) of sequences at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
aRecord["FIELD_NAME"]			= "REFERENCE";
aRecord["DESCRIPTION"]		= "Codon of the reference sequence at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
aRecord["FIELD_NAME"]			= "CONSENSUS";
aRecord["DESCRIPTION"]		= "Consensus codon at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
aRecord["FIELD_NAME"]			= "REFERENCE_AA";
aRecord["DESCRIPTION"]		= "Residue of the reference sequence at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
aRecord["FIELD_NAME"]			= "CONSENSUS";
aRecord["DESCRIPTION"]		= "Consensus residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "AA_ALIGNMENT";
for (k = 0; k < alphCharCount; k=k+1)
{
	ExecuteCommands ( "aRecord[\"FIELD_NAME\"]			= \"" + codonStrings[k] + "\";" );
	ExecuteCommands ( "aRecord[\"DESCRIPTION\"]		= \"Count of " + codonStrings[k] + " codons at the site\";" );
	_InsertRecord (DBID, "LEGEND", aRecord);
}

/*ACCESSORY_MUTATIONS*/

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "READ_ID";
aRecord["DESCRIPTION"]		= "Read ID as in original fasta file.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "PRIMARY_SITE";
aRecord["DESCRIPTION"]		= "Primary drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "PRIMARY_WT";
aRecord["DESCRIPTION"]		= "Wildtype at primary drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "PRIMARY_RT";
aRecord["DESCRIPTION"]		= "Resistant residue at primary drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "PRIMARY_OBS";
aRecord["DESCRIPTION"]		= "Observed residue at primary drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "SECONDARY_SITE";
aRecord["DESCRIPTION"]		= "Secondary drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "SECONDARY_WT";
aRecord["DESCRIPTION"]		= "Wildtype at secondary/compensatory drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "SECONDARY_RT";
aRecord["DESCRIPTION"]		= "Resistant residue at secondary/compensatory drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "SECONDARY_OBS";
aRecord["DESCRIPTION"]		= "Observed residue at secondary/compensatory drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "HXB2_AA";
aRecord["DESCRIPTION"]		= "HXB2 amino acid reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "READ_AA";
aRecord["DESCRIPTION"]		= "Read amino acid sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "PER_BASE_SC";
aRecord["DESCRIPTION"]		= "Per base alignment score with HXB2 reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_MUTATIONS";
aRecord["FIELD_NAME"]			= "EXP_PER_BASE_SC";
aRecord["DESCRIPTION"]		= "Per base alignment score expected with a random sequence generated from observed residue frequencies.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*ACCESSORY_TEST*/

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_TEST";
aRecord["FIELD_NAME"]			= "DR_ACC";
aRecord["DESCRIPTION"]		= "Count of reads with drug resistant residue at primary site AND compensatory mutation at secondary site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_TEST";
aRecord["FIELD_NAME"]			= "NOTDR_ACC";
aRecord["DESCRIPTION"]		= "Count of reads with non-drug resistant residue at primary site AND compensatory mutation at secondary site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_TEST";
aRecord["FIELD_NAME"]			= "DR_NOTACC";
aRecord["DESCRIPTION"]		= "Count of reads with drug resistant residue at primary site AND non-compensatory mutation at secondary site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_TEST";
aRecord["FIELD_NAME"]			= "NOTDR_NOTACC";
aRecord["DESCRIPTION"]		= "Count of reads with non-drug resistant residue at primary site AND non-compensatory mutation at secondary site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "ACCESSORY_TEST";
aRecord["FIELD_NAME"]			= "P_VAL";
aRecord["DESCRIPTION"]		= "P-value on Fishers Exact Test.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*BASE_FREQUENCIES*/
aRecord = {};
aRecord["TABLE_NAME"]			= "BASE_FREQUENCIES";
aRecord["FIELD_NAME"]			= "MATRIX";
aRecord["DESCRIPTION"]		= "Matrix of amino acid frequencies in HyPhy order. ie: FLIMVSPTAYXHQNKDECWRG";
_InsertRecord (DBID, "LEGEND", aRecord);

/*DIVERSITY_SW*/
aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "WIDTH";
aRecord["DESCRIPTION"]		= "Width of sliding window.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "STRIDE";
aRecord["DESCRIPTION"]		= "Stride length of sliding window.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "MIN_COVERAGE";
aRecord["DESCRIPTION"]		= "Minimum coverage for inclusion of sliding window in estimates of nucleotide diversity.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "DIV_THRESHOLD";
aRecord["DESCRIPTION"]		= "Diversity threshold for the estimation of dual/multi infection.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "NUM_WINDOWS";
aRecord["DESCRIPTION"]		= "Number of sliding windows that met minimum coverage threshold.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "MAX_DIVERGENCE";
aRecord["DESCRIPTION"]		= "Maximum nucleotide diversity for all sliding windows.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "MAX_DIVERGENCE_WINDOW";
aRecord["DESCRIPTION"]		= "Sliding window of maximum nucleotide diversity (indexed from start of reference sequence).";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SW";
aRecord["FIELD_NAME"]			= "DUAL_INFECTION";
aRecord["DESCRIPTION"]		= "Integer specifying whether nucleotide diversity exceeds the diversity threshold (DIV_THRESHOLD) for the identification of dual/multi infection (0/1: No/Yes).";
_InsertRecord (DBID, "LEGEND", aRecord);

/*DIVERSITY_SWS*/
aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "START";
aRecord["DESCRIPTION"]		= "Start of sliding window.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "END";
aRecord["DESCRIPTION"]		= "End of sliding window.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "COVERAGE";
aRecord["DESCRIPTION"]		= "Coverage in sliding window.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "FREQ_CUTOFF";
aRecord["DESCRIPTION"]		= "Number of copies required for identification of a variant. This is either defined as the minimum copy count (default = 10) or 1% of the coverage within the sliding window, whichever is greater.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "VARIANTS";
aRecord["DESCRIPTION"]		= "Number of variants identified in the sliding window.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "DIV_ML";
aRecord["DESCRIPTION"]		= "Maximum likelihood estimate of nucleotide diversity in the sliding window.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "DIV_MED";
aRecord["DESCRIPTION"]		= "The median of the distribution of nucleotide diversity estimated using resampling.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "DIV_25";
aRecord["DESCRIPTION"]		= "The 2.5 percentile of the distribution of nucleotide diversity estimated using resampling.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "DIV_975";
aRecord["DESCRIPTION"]		= "The 97.5 percentile of the distribution of nucleotide diversity estimated using resampling.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DIVERSITY_SWS";
aRecord["FIELD_NAME"]			= "DUAL_INFECTION";
aRecord["DESCRIPTION"]		= "Integer specifying whether nucleotide diversity exceeds the diversity threshold (DIV_THRESHOLD) for the identification of dual/multi infection (0/1: No/Yes).";
_InsertRecord (DBID, "LEGEND", aRecord);

/*DNDS*/
aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "POS";
aRecord["DESCRIPTION"]		= "Amino acid position indexed on the reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "CONS_AA";
aRecord["DESCRIPTION"]		= "Consensus amino acid at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "S_SITES";
aRecord["DESCRIPTION"]		= "The expected number of synonymous substitutions based on the codon frequencies at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "NS_SITES";
aRecord["DESCRIPTION"]		= "The expected number of non-synonymous substitutions based on the codon frequencies at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "S_SUBS";
aRecord["DESCRIPTION"]		= "The number of synonymous substitutions observed at a site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "NS_SUBS";
aRecord["DESCRIPTION"]		= "The number of non-synonymous substitutions observed at a site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "PP_REAL";
aRecord["DESCRIPTION"]		= "P-value for a test of diversifying selection at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "DNDS";
aRecord["FIELD_NAME"]			= "PN_REAL";
aRecord["DESCRIPTION"]		= "P-value for a test of purifying selection at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*MDR_SUMMARY*/
aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_SUMMARY";
aRecord["FIELD_NAME"]			= "REF_GENE";
aRecord["DESCRIPTION"]		= "Gene region checked for drug resistance mutations.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_SUMMARY";
aRecord["FIELD_NAME"]			= "DRUG_CLASS";
aRecord["DESCRIPTION"]		= "Drug class.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_SUMMARY";
aRecord["FIELD_NAME"]			= "MEDIAN_MUT_RNK";
aRecord["DESCRIPTION"]		= "Median mutation rank of drug resistant sites when mutation rates are compared to all other sites.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_SUMMARY";
aRecord["FIELD_NAME"]			= "P_VALUE";
aRecord["DESCRIPTION"]		= "P-value on a permutation test which determines whether MEDIAN_MUT_RNK is greater than a random sample of sites.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_SUMMARY";
aRecord["FIELD_NAME"]			= "DR_SCORE";
aRecord["DESCRIPTION"]		= "Minimum Stanford Score to consider a residue as drug resistant.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_SUMMARY";
aRecord["FIELD_NAME"]			= "DR_COVERAGE";
aRecord["DESCRIPTION"]		= "Minimum coverage to consider a drug resistant site.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*MDR_VARIANTS*/
aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "MDR_SITE";
aRecord["DESCRIPTION"]		= "Drug resistant site indexed from start of rt or pr.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "SITE_GENE_START";
aRecord["DESCRIPTION"]		= "Site indexed from start of reference gene.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "DRUG_CLASS";
aRecord["DESCRIPTION"]		= "Drug class.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "DRUG_REPORT";
aRecord["DESCRIPTION"]		= "(Residue Stanford_Score Drug) separated by : for all known drug resistant mutations at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "COVERAGE";
aRecord["DESCRIPTION"]		= "Coverage at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "WILDTYPE";
aRecord["DESCRIPTION"]		= "Number of reads with wildtype residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "WILDTYPE_PRCNT";
aRecord["DESCRIPTION"]		= "Percent of reads with wildtype residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "RESISTANCE";
aRecord["DESCRIPTION"]		= "Number of reads with resistance residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "RESISTANCE_PRCNT";
aRecord["DESCRIPTION"]		= "Percent of reads with resistance residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "CI";
aRecord["DESCRIPTION"]		= "Confidence interval on percent of reads with resistant residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "OTHER";
aRecord["DESCRIPTION"]		= "Number of reads with non-wildtype and non-resistance residues at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "OTHER_PRCNT";
aRecord["DESCRIPTION"]		= "Percent of reads with non-wildtype and non-resistance residues at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "ENTROPY";
aRecord["DESCRIPTION"]		= "Measure of information content at the site. Entropy can be thought of as a measure of how much is learnt by looking at the data. Invariant sites have entropy = 0, whereas sites with equal amino acid frequencies have entropy = 1.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "MU";
aRecord["DESCRIPTION"]		= "Mutation rate at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MDR_VARIANTS";
aRecord["FIELD_NAME"]			= "MU_RNK_PRCTL";
aRecord["DESCRIPTION"]		= "Rank of mutation rate at site with respect to all other sites (including non-drug resistant).";
_InsertRecord (DBID, "LEGEND", aRecord);


/*MU_RATE_CLASSES*/
aRecord = {};
aRecord["TABLE_NAME"]			= "MU_RATE_CLASSES";
aRecord["FIELD_NAME"]			= "NUM_RATES";
aRecord["DESCRIPTION"]		= "Number of mutation rate classes inferred using a binomial mixture model.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MU_RATE_CLASSES";
aRecord["FIELD_NAME"]			= "RATE_CLASS";
aRecord["DESCRIPTION"]		= "Index of inferred rate class.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MU_RATE_CLASSES";
aRecord["FIELD_NAME"]			= "MU_RATE";
aRecord["DESCRIPTION"]		= "Mutation rate of inferred rate class.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MU_RATE_CLASSES";
aRecord["FIELD_NAME"]			= "WEIGHT";
aRecord["DESCRIPTION"]		= "Proportion of sites in mutation rate class RATE_CLASS with mutation rate MU_RATE.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MU_RATE_CLASSES";
aRecord["FIELD_NAME"]			= "LOG_LK";
aRecord["DESCRIPTION"]		= "Likelihood of observing the data for the number of mutation rate classes.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "MU_RATE_CLASSES";
aRecord["FIELD_NAME"]			= "AIC";
aRecord["DESCRIPTION"]		= "Akaike Information Criterion for the given number of mutation rate classes.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*NUC_ALIGNMENT*/

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "A";
aRecord["DESCRIPTION"]		= "Count of As at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "AMBIG";
aRecord["DESCRIPTION"]		= "Count of ambiguous nucleotides at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "C";
aRecord["DESCRIPTION"]		= "Count of Cs at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "CONSENSUS";
aRecord["DESCRIPTION"]		= "Consensus nucleotide at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "COVERAGE";
aRecord["DESCRIPTION"]		= "Coverage at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "DEL";
aRecord["DESCRIPTION"]		= "Number of deletions with respect to reference.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "G";
aRecord["DESCRIPTION"]		= "Count of Gs at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "INDEL_POSITION";
aRecord["DESCRIPTION"]		= "Indel number in the reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "POSITION";
aRecord["DESCRIPTION"]		= "Position with respect to reference.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "REFERENCE";
aRecord["DESCRIPTION"]		= "Nucleotide at position in reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "NUC_ALIGNMENT";
aRecord["FIELD_NAME"]			= "T";
aRecord["DESCRIPTION"]		= "Count of Ts at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*SEQUENCES*/
aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "ALIGNED";
aRecord["DESCRIPTION"]		= "Nucleotide sequence of the read as aligned to the reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "ALIGNED_AA";
aRecord["DESCRIPTION"]		= "Amino acid sequence of the read pruned to exactly overlapping region with reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "ALIGNED_AA_REF";
aRecord["DESCRIPTION"]		= "Amino acid sequence of the reference pruned to exactly overlapping region with the read sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "FRAME";
aRecord["DESCRIPTION"]		= "Reading frame (0,1,2) of the nucleotide read.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "LENGTH";
aRecord["DESCRIPTION"]		= "Sequence read length.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "NUC_PASS2";
aRecord["DESCRIPTION"]		= "Nucleotide sequence of the read pruned to exactly overlapping region with reference sequence contained in SETTINGS.REFERENCE_PASS2.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "OFFSET";
aRecord["DESCRIPTION"]		= "The offset (in nucleotides) of the read relative to the reference sequence contained in SETTINGS.REFERENCE.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "OFFSET_PASS2";
aRecord["DESCRIPTION"]		= "The offset (in nucleotides) of the read relative to the reference sequence contained in SETTINGS.REFERENCE_PASS2";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "RAW";
aRecord["DESCRIPTION"]		= "Unaligned raw sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "RC";
aRecord["DESCRIPTION"]		= "A flag indicating whether read should be reverse complemented (0/1:No/Yes).";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "REF_PASS2";
aRecord["DESCRIPTION"]		= "Nucleotide sequence of the reference pruned to exactly overlapping region with the nucleotide read sequence in NUC_PASS2.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "SCORE";
aRecord["DESCRIPTION"]		= "Per base alignment score.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "SCORE_PASS2";
aRecord["DESCRIPTION"]		= "Per base alignment score from nucleotide alignment.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "SEQUENCE_ID";
aRecord["DESCRIPTION"]		= "Unique read identifier.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "SPAN";
aRecord["DESCRIPTION"]		= "The number of non-indel residue positions that occur in the exactly overlapping region of reference and read sequences at the exclusion of leading and trailing indels in both. SPAN is used for the estimation of a per base alignment score.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "SPAN_PASS2";
aRecord["DESCRIPTION"]		= "The number of non-indel positions that occur in the exactly overlapping region of reference and read sequences at the exclusion of leading and trailing indels in both. SPAN is used for the estimation of a per base alignment score.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SEQUENCES";
aRecord["FIELD_NAME"]			= "STAGE";
aRecord["DESCRIPTION"]		= "Filtering stage of sequence where 0 = imported read from .fna; 1 = read is in frame without modification; 2 = accepted nucleotide alignment after indels have been fixed; 3 = out-of-frame and not fixed/aligned; 4 = complete discard of read.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*SETTINGS*/
aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "GENETIC_CODE";
aRecord["DESCRIPTION"]		= "Genetic code used in nucleotide to amino acid translation.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "MIN_LENGTH";
aRecord["DESCRIPTION"]		= "Minimum read length to be included in analysis.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "OPTIONS";
aRecord["DESCRIPTION"]		= "Alignment options used for pairwise alignment used in the HyPhy AlignSequences function.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "REFERENCE";
aRecord["DESCRIPTION"]		= "Reference sequence. Either chosen from a list before processing, or the longest read from the file.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "REFERENCE_PASS2";
aRecord["DESCRIPTION"]		= "Reference sequence for the second alignment pass. Nucleotide alignment is attempted with reads not meeting the minimum threshold in the amino acid alignment. The new reference sequence is the consensus of all reads included in the first alignment step.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "RUN_DATE";
aRecord["DESCRIPTION"]		= "Date analysis was initiated.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "THRESHOLD";
aRecord["DESCRIPTION"]		= "Alignment threshold used for inclusion of read. The default threshold is 5 times the expected per base alignment score calculated using a randomly generated sequence with identical nucleotide composition.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "THRESHOLD_PASS2";
aRecord["DESCRIPTION"]		= "Alignment threshold used for inclusion of read. For the nucleotide alignment the threshold is the median of the distribution of per nucleotide alignment scores from the reads which were included in the amino acid alignment phase.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "MIN_COVERAGE";
aRecord["DESCRIPTION"]		= "Minimum coverage required for the estimation of frequencies of varaints at a site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "SW_SIZE";
aRecord["DESCRIPTION"]		= "Length of sliding windows for the estimation of nucleotide diversity.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "SW_STRIDE";
aRecord["DESCRIPTION"]		= "Length of sliding window stride for the estimation of nucleotide diversity.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "MIN_COPIES";
aRecord["DESCRIPTION"]		= "Minimum number of copies to be considered a variant.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "DUAL_INFECTION_THRESHOLD";
aRecord["DESCRIPTION"]		= "Threshold for the estimation of dual/multi infection from nucleotide diversity.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "STANFORD_SCORE";
aRecord["DESCRIPTION"]		= "Minimum drug resistance score to consider a drug resistant mutation.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SETTINGS";
aRecord["FIELD_NAME"]			= "MIN_DR_COVERAGE";
aRecord["DESCRIPTION"]		= "Minimum coverage required for analysis at drug resistance sites.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*SITE_DR_POSTERIORS*/

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_DR_POSTERIORS";
aRecord["FIELD_NAME"]			= "SITE";
aRecord["DESCRIPTION"]		= "Amino Acid site indexed according to the start of the gene in HXB2 reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_DR_POSTERIORS";
aRecord["FIELD_NAME"]			= "COVERAGE";
aRecord["DESCRIPTION"]		= "Coverage (depth) of sequences at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_DR_POSTERIORS";
aRecord["FIELD_NAME"]			= "CONSENSUS";
aRecord["DESCRIPTION"]		= "Number of reads with consensus residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_DR_POSTERIORS";
aRecord["FIELD_NAME"]			= "RATE_CLASS";
aRecord["DESCRIPTION"]		= "Rate class estimated using a binomial mixture model.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_DR_POSTERIORS";
aRecord["FIELD_NAME"]			= "RATE";
aRecord["DESCRIPTION"]		= "Mutation rate estimated using a binomial mixture model.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_DR_POSTERIORS";
aRecord["FIELD_NAME"]			= "WEIGHT";
aRecord["DESCRIPTION"]		= "Proportion of sites in mutation rate class RATE_CLASS with mutation rate MU_RATE.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_DR_POSTERIORS";
aRecord["FIELD_NAME"]			= "POSTERIOR";
aRecord["DESCRIPTION"]		= "Posterior probability that SITE belongs to RATE_CLASS with mutation rate MU_RATE.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*SITE_MU_RATES*/

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_MU_RATES";
aRecord["FIELD_NAME"]			= "SITE";
aRecord["DESCRIPTION"]		= "Amino Acid site indexed according to the start of the reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_MU_RATES";
aRecord["FIELD_NAME"]			= "COVERAGE";
aRecord["DESCRIPTION"]		= "Coverage (depth) of sequences at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_MU_RATES";
aRecord["FIELD_NAME"]			= "CONSENSUS";
aRecord["DESCRIPTION"]		= "Number of reads with consensus residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_MU_RATES";
aRecord["FIELD_NAME"]			= "ENTROPY";
aRecord["DESCRIPTION"]		= "Measure of information content at the site. Entropy can be thought of as a measure of how much is learnt by looking at the data. Invariant sites have entropy = 0, whereas sites with equal amino acid frequencies have entropy = 1";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_MU_RATES";
aRecord["FIELD_NAME"]			= "MU";
aRecord["DESCRIPTION"]		= "Mutation rate at a site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_MU_RATES";
aRecord["FIELD_NAME"]			= "MU_RNK_PRCNT";
aRecord["DESCRIPTION"]		= "Rank of the mutation rate at the site with respect to the mutation rates at all sites.";
_InsertRecord (DBID, "LEGEND", aRecord);

/*SITE_POSTERIORS*/

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_POSTERIORS";
aRecord["FIELD_NAME"]			= "SITE";
aRecord["DESCRIPTION"]		= "Amino Acid site indexed according to the start of the reference sequence.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_POSTERIORS";
aRecord["FIELD_NAME"]			= "COVERAGE";
aRecord["DESCRIPTION"]		= "Coverage (depth) of sequences at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_POSTERIORS";
aRecord["FIELD_NAME"]			= "CONSENSUS";
aRecord["DESCRIPTION"]		= "Number of reads with consensus residue at the site.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_POSTERIORS";
aRecord["FIELD_NAME"]			= "RATE_CLASS";
aRecord["DESCRIPTION"]		= "Rate class estimated using a binomial mixture model.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_POSTERIORS";
aRecord["FIELD_NAME"]			= "RATE";
aRecord["DESCRIPTION"]		= "Mutation rate estimated using a binomial mixture model.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_POSTERIORS";
aRecord["FIELD_NAME"]			= "WEIGHT";
aRecord["DESCRIPTION"]		= "Proportion of sites in mutation rate class RATE_CLASS with mutation rate MU_RATE.";
_InsertRecord (DBID, "LEGEND", aRecord);

aRecord = {};
aRecord["TABLE_NAME"]			= "SITE_POSTERIORS";
aRecord["FIELD_NAME"]			= "POSTERIOR";
aRecord["DESCRIPTION"]		= "Posterior probability that SITE belongs to RATE_CLASS with mutation rate MU_RATE.";
_InsertRecord (DBID, "LEGEND", aRecord);


DoSQL ( SQL_CLOSE, "", DBID );

function	codeToCodon (int_code)
{
	return NucLetters[int_code$16] + NucLetters[(int_code%16$4)] + NucLetters[int_code%4];
}
