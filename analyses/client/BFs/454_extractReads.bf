ExecuteAFile 					("../Shared/GrabBag.bf");
ExecuteAFile 					("../Shared/DBTools.ibf");
ExecuteAFile					("../Shared/HyPhyGlobals.ibf" );

fscanf ( stdin, "String", filePrefix );
fscanf ( stdin, "Number", aa_out );
fscanf ( stdin, "Number", aligned );
fscanf ( stdin, "String", _in_gene );

db_file = BASE_OUTPUT_PATH + filePrefix + "_uds." + _in_gene + ".cache";
DoSQL ( SQL_OPEN, db_file, DBID );

if ( aligned ) {
	seqFIELD = "NUC_PASS2";
}
else {
	seqFIELD = "RAW";
}
if ( aa_out ) {
	seqFIELD = "ALIGNED_AA";
}

sequenceAVL = _ExecuteSQL ( DBID, "SELECT " + seqFIELD + ",OFFSET_PASS2,SEQUENCE_ID FROM SEQUENCES WHERE SPAN_PASS2 > 0 ORDER BY OFFSET_PASS2");

_recordsFound = {};
DoSQL ( DBID, "SELECT REFERENCE_PASS2 FROM SETTINGS", "return _matchRecordsByField (0);" );
refSequence = "" + _recordsFound[0];

if ( aligned ) {
	fprintf ( stdout, "> reference\n", refSequence, "\n" );
}

gapped = ""; gapped * 128; 
for (_a = 0; _a < Abs (refSequence); _a += 1) {
    gapped * "-";
}
gapped * 0;

fprintf ( stdout, extractDaSequences ( seqFIELD, "SEQUENCE_ID", sequenceAVL, aligned, gapped ) );
 

function extractDaSequences ( _sequenceField, _nameField, _avl, aln, gapper ) 
{
	dataString 	= "";
	dataString 	* 1024;
	refSeqLen   = Abs(refSequence) - 1;
	seq_count = Abs ( _avl );
	for ( _a = 0; _a < seq_count; _a += 1 ) {
		if ( Abs ((_avl[ _a ])[_sequenceField]) ) {
			offset    = (-1) + (_avl[_a])["OFFSET_PASS2"];
			seqLength = 0 + Abs ( (_avl[ _a ])[_sequenceField] );
			dataString * ( ">" + (_avl[ _a ])[_nameField] + "\n" );
			if ( aln && offset) {
			        dataString * (gapper[0][offset-1]);
			}
			if ( aa_out ) {
				dataString * ( "" + ((_avl[ _a ])[_sequenceField])^{{"-"}{""}} + "" );
			}
			else {
				dataString * ( "" + (_avl[ _a ])[_sequenceField] + "" );
			}
			if ( aln ) {
				slen = refSeqLen - offset - seqLength;
                if (slen >= 0) {
			        dataString * (gapper[0][slen]);
			    }				
			}
		dataString * ( "\n" );
		}
	}
	dataString 	* 0;
	return dataString;
}