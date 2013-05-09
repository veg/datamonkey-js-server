LoadFunctionLibrary ("chooseGeneticCode", {"00":"Universal"});
LoadFunctionLibrary ("GrabBag");


_cdnaln_protScoreMatrix =
{
 { 6, -3, -4, -4, -2, -2, -2, -1, -3, -3, -3, -2, -2, -4, -2,  0, -1, -5, -3, -1, -4, -2, -2, -7}
 {-3,  8, -2, -4, -6,  0, -2, -5, -2, -6, -4,  1, -3, -5, -4, -2, -3, -5, -3, -5, -3, -1, -2, -7}
 {-4, -2,  8,  0, -5, -1, -2, -2,  0, -6, -6, -1, -4, -5, -4,  0, -1, -7, -4, -5,  6, -2, -2, -7}
 {-4, -4,  0,  8, -6, -2,  0, -3, -3, -5, -6, -2, -6, -6, -3, -1, -3, -7, -6, -6,  6,  0, -3, -7}
 {-2, -6, -5, -6, 10, -5, -7, -5, -5, -3, -3, -6, -3, -5, -5, -2, -2, -4, -4, -2, -5, -6, -4, -7}
 {-2,  0, -1, -2, -5,  8,  1, -4,  0, -6, -4,  0, -1, -6, -3, -1, -2, -3, -3, -4, -1,  6, -2, -7}
 {-2, -2, -2,  0, -7,  1,  7, -4, -1, -6, -5,  0, -4, -6, -3, -1, -2, -5, -4, -4,  0,  6, -2, -7}
 {-1, -5, -2, -3, -5, -4, -4,  7, -4, -7, -6, -3, -5, -5, -4, -2, -4, -4, -5, -6, -2, -4, -4, -7}
 {-3, -2,  0, -3, -5,  0, -1, -4, 10, -6, -5, -2, -3, -3, -4, -2, -4, -5,  0, -6, -1, -1, -3, -7}
 {-3, -6, -6, -5, -3, -6, -6, -7, -6,  6,  0, -5,  0, -1, -5, -5, -2, -5, -3,  2, -5, -6, -2, -7}
 {-3, -4, -6, -6, -3, -4, -5, -6, -5,  0,  6, -5,  1, -1, -5, -5, -3, -3, -3,  0, -6, -5, -2, -7}
 {-2,  1, -1, -2, -6,  0,  0, -3, -2, -5, -5,  7, -3, -6, -2, -1, -2, -5, -3, -4, -2,  0, -2, -7}
 {-2, -3, -4, -6, -3, -1, -4, -5, -3,  0,  1, -3,  9, -1, -5, -3, -2, -3, -3,  0, -5, -2, -1, -7}
 {-4, -5, -5, -6, -5, -6, -6, -5, -3, -1, -1, -6, -1,  8, -6, -4, -4,  0,  1, -3, -6, -6, -3, -7}
 {-2, -4, -4, -3, -5, -3, -3, -4, -4, -5, -5, -2, -5, -6,  9, -2, -3, -6, -5, -4, -4, -3, -4, -7}
 { 0, -2,  0, -1, -2, -1, -1, -2, -2, -5, -5, -1, -3, -4, -2,  7,  0, -5, -3, -4, -1, -1, -2, -7}
 {-1, -3, -1, -3, -2, -2, -2, -4, -4, -2, -3, -2, -2, -4, -3,  0,  7, -4, -3, -1, -2, -2, -2, -7}
 {-5, -5, -7, -7, -4, -3, -5, -4, -5, -5, -3, -5, -3,  0, -6, -5, -4, 12,  0, -6, -7, -4, -4, -7}
 {-3, -3, -4, -6, -4, -3, -4, -5,  0, -3, -3, -3, -3,  1, -5, -3, -3,  0,  9, -3, -5, -3, -2, -7}
 {-1, -5, -5, -6, -2, -4, -4, -6, -6,  2,  0, -4,  0, -3, -4, -4, -1, -6, -3,  6, -6, -4, -2, -7}
 {-4, -3,  6,  6, -5, -1,  0, -2, -1, -5, -6, -2, -5, -6, -4, -1, -2, -7, -5, -6,  7, -1, -3, -7}
 {-2, -1, -2,  0, -6,  6,  6, -4, -1, -6, -5,  0, -2, -6, -3, -1, -2, -4, -3, -4, -1,  7, -2, -7}
 {-2, -2, -2, -3, -4, -2, -2, -4, -3, -2, -2, -2, -1, -3, -4, -2, -2, -4, -2, -2, -3, -2, -2, -7}
 {-7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7, -7,  1}
};

_cdnaln_base_frequencies = {
{0.060490222}
{0.020075899}
{0.042109048}
{0.071567447}
{0.028809447}
{0.072308239}
{0.022293943}
{0.069730629}
{0.056968211}
{0.098851122}
{0.019768318}
{0.044127815}
{0.046025282}
{0.053606488}
{0.066039665}
{0.050604330}
{0.053636813}
{0.061625237}
{0.033011601}
{0.028350243}
};



_cdnaln_protLetters = "ARNDCQEGHILKMFPSTWYV";
_cdnaln_scoreMatrix = pSM2cSM(_cdnaln_protScoreMatrix, _cdnaln_protLetters);

_cdnaln_alnopts = {};
_cdnaln_alnopts ["SEQ_ALIGN_SCORE_MATRIX"] = _cdnaln_scoreMatrix;
_cdnaln_alnopts ["SEQ_ALIGN_GAP_OPEN"] = -2*Min(_cdnaln_protScoreMatrix,0);
_cdnaln_alnopts ["SEQ_ALIGN_AFFINE"] = 1;
_cdnaln_alnopts ["SEQ_ALIGN_GAP_OPEN2"] = 20;
_cdnaln_alnopts ["SEQ_ALIGN_GAP_EXTEND2"] = 1;
_cdnaln_alnopts ["SEQ_ALIGN_GAP_EXTEND"] = 10;
_cdnaln_alnopts ["SEQ_ALIGN_FRAMESHIFT"] = -2*Min(_cdnaln_protScoreMatrix,0);
_cdnaln_alnopts ["SEQ_ALIGN_CODON_ALIGN"] = 1;
_cdnaln_alnopts ["SEQ_ALIGN_NO_TP"] = 1; // this means local alignment, apparently
_cdnaln_alnopts ["SEQ_ALIGN_CHARACTER_MAP"] = "ACGT";

_cdnaln_partialScoreMatrices = cSM2partialSMs(_cdnaln_scoreMatrix);

_cdnaln_alnopts ["SEQ_ALIGN_PARTIAL_3x1_SCORES"] = _cdnaln_partialScoreMatrices["3x1"];
_cdnaln_alnopts ["SEQ_ALIGN_PARTIAL_3x2_SCORES"] = _cdnaln_partialScoreMatrices["3x2"];
_cdnaln_alnopts ["SEQ_ALIGN_PARTIAL_3x4_SCORES"] = _cdnaln_partialScoreMatrices["3x4"];
_cdnaln_alnopts ["SEQ_ALIGN_PARTIAL_3x5_SCORES"] = _cdnaln_partialScoreMatrices["3x5"];

	
function pSM2cSM(_protScoreMatrix, _protLetters)
{
    LoadFunctionLibrary( "chooseGeneticCode", { "00": "Universal" } );
    LoadFunctionLibrary( "GrabBag" );

    _scoreMatrix  = { 65,65 };
    _mapping      = mapStrings( _hyphyAAOrdering, _protLetters );
    for ( _k = 0; _k < 64; _k += 1 ) {
        _mappedK = _mapping[ _Genetic_Code[ _k ] ];
        if ( _mappedK >= 0) {
            for ( _k2 = _k; _k2 < 64; _k2 += 1 ) {
                _mappedK2 = _mapping[ _Genetic_Code[ _k2 ] ];
                if ( _mappedK2 >= 0 ) {
                    _aScore = _protScoreMatrix[ _mappedK ][ _mappedK2 ];
                    if ( _mappedK == _mappedK2 && _k2 > _k ) {
                        _aScore = _aScore - 1;
                    }
                } else {
                    // stop codons don't match anything
                    _aScore = -1e4;
                }
                _scoreMatrix[ _k ][ _k2 ] = _aScore;
                _scoreMatrix[ _k2 ][ _k ] = _aScore;
            }
        } else {
            for ( _k2 = _k; _k2 < 64; _k2 += 1 ) {
                _mappedK2 = _mapping[ _Genetic_Code[ _k2 ] ];
                if ( _mappedK2 < 0 ) {
                    // don't penalize stop codons matching themselves
                    _scoreMatrix[ _k ][ _k2 ] = 0;
                    _scoreMatrix[ _k2 ][ _k ] = 0;
                } else {
                    _scoreMatrix[ _k ][ _k2 ] = -1e4;
                    _scoreMatrix[ _k2 ][ _k ] = -1e4;
                }
            }
        }
    }

    return _scoreMatrix;
}	
	
function cSM2partialSMs(_scoreMatrix)
{
    m3x5  =  { 65, 640 };
    m3x4  =  { 65, 256 };
    m3x2  =  { 65,  48 };
    m3x1  =  { 65,  12 };

    // minor penalties to make mismatch not entirely free
    p3x5 = 0;
    p3x4 = 0;
    p3x2 = 0;
    p3x1 = 0;

    for ( thisCodon = 0; thisCodon < 64; thisCodon += 1 ) {
        for ( d1 = 0; d1 < 4; d1 += 1 ) {
            max100 = -1e100;
            max010 = -1e100;
            max001 = -1e100;

            for ( d2 = 0; d2 < 4; d2 += 1 ) {
                partialCodon = 4 * d1 + d2;
                max110 = -1e100;
                max101 = -1e100;
                max011 = -1e100;

                for ( d3 = 0; d3 < 4; d3 += 1 ) {
                    thisCodon2 = 4 * partialCodon + d3;
                    thisScore = _scoreMatrix[ thisCodon ][ thisCodon2 ];

                    // this is the trivial and stupid way of doing it, but it should work
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 0 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 1 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 2 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 3 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 4 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 5 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 6 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 7 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 8 ] = thisScore - p3x5;
                    m3x5[ thisCodon ][ 10 * thisCodon2 + 9 ] = thisScore - p3x5;

                    m3x4[ thisCodon ][ 4 * thisCodon2 + 0 ] = thisScore - p3x4;
                    m3x4[ thisCodon ][ 4 * thisCodon2 + 1 ] = thisScore - p3x4;
                    m3x4[ thisCodon ][ 4 * thisCodon2 + 2 ] = thisScore - p3x4;
                    m3x4[ thisCodon ][ 4 * thisCodon2 + 3 ] = thisScore - p3x4;

                    // d1 is 1
                    max100 = Max( max100, _scoreMatrix[ thisCodon ][ 16 * d1 + 4 * d2 + d3 ] );
                    max010 = Max( max010, _scoreMatrix[ thisCodon ][ 16 * d2 + 4 * d1 + d3 ] );
                    max001 = Max( max001, _scoreMatrix[ thisCodon ][ 16 * d2 + 4 * d3 + d1 ] );

                    // d1 and d2 are 1
                    max110 = Max( max110, _scoreMatrix[ thisCodon ][ 16 * d1 + 4 * d2 + d3 ] );
                    max101 = Max( max101, _scoreMatrix[ thisCodon ][ 16 * d1 + 4 * d3 + d2 ] );
                    max011 = Max( max011, _scoreMatrix[ thisCodon ][ 16 * d3 + 4 * d1 + d2 ] );
                }

                m3x2[ thisCodon ][ 3 * partialCodon + 0 ] = max110 - p3x2;
                m3x2[ thisCodon ][ 3 * partialCodon + 1 ] = max101 - p3x2;
                m3x2[ thisCodon ][ 3 * partialCodon + 2 ] = max011 - p3x2;
            }

            m3x1[ thisCodon ][ 3 * d1 + 0 ] = max100 - p3x1;
            m3x1[ thisCodon ][ 3 * d1 + 1 ] = max010 - p3x1;
            m3x1[ thisCodon ][ 3 * d1 + 2 ] = max001 - p3x1;
        }
    }
    return { "3x1": m3x1, "3x2": m3x2, "3x4": m3x4, "3x5": m3x5 };
}


codonToCode = {};
c  = 0;
nl = "ACGT";

for (l1 = 0; l1 < 4; l1+=1)
{
	for (l2 = 0; l2 < 4; l2+=1)
	{
		for (l3 = 0; l3 < 4; l3+=1)
		{
			codonToCode [nl[l1]+nl[l2]+nl[l3]] = c;
			c += 1;
		}	
	}
}

s1 = "GTTATAGGAGAAGGAAGAAAAAGAGATGTGAAGGTAAACGTGGGAAGGCTGTCCGTACTTGTTATAGGAGAAGGAAGAAAAAGAGATGTGAAGGTAAACGTGGGAAGGCTGTCCGTACTT";
s2 = "GTTATAGGAGAGGGAAGAAAAAGAGATGTAAAGGTAAACGTGGAAATGCTGTCCGTGCTTGTTATAGGAGAGGGAAGAAAAAGAGATGTAAAGGTAAACGTGGAAATGCTGCTGTCCGTGCTT";

//s1 = "CCTCCN";
//s2 = "CCTCCN";

inStr = {{s1,s2}};

s1 = (s1&&1) ^ {{"[^A-Z]",""}};
s2 = (s2&&1) ^ {{"[^A-Z]",""}};

AlignSequences (out, inStr, _cdnaln_alnopts);

s = ">1\n" + (out[0])[1] + "\n>2\n" + (out[0])[2];

fprintf (stdout, "\n", s, "\n", (out[0])[0]);

DataSet calign = ReadFromString (s);