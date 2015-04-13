#!/bin/bash
#  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.
#
#  Copyright (C) 2013
#  Sergei L Kosakovsky Pond (spond@ucsd.edu)
#  Steven Weaver (sweaver@ucsd.edu)
#
#  Permission is hereby granted, free of charge, to any person obtaining a
#  copy of this software and associated documentation files (the
#  "Software"), to deal in the Software without restriction, including
#  without limitation the rights to use, copy, modify, merge, publish,
#  distribute, sublicense, and/or sell copies of the Software, and to
#  permit persons to whom the Software is furnished to do so, subject to
#  the following conditions:
#
#  The above copyright notice and this permission notice shall be included
#  in all copies or substantial portions of the Software.
#
#  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
#  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
#  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
#  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
#  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
#  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
#  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

export PATH=/usr/local/bin:$PATH

LANL_FASTA='/data/veg/hivcluster/example_files/LANL.FASTA'
LANL_TN93OUTPUT_CSV='/data/veg/hivcluster/example_files/LANL.TN93OUTPUT.csv'

FN=$fn
DISTANCE_THRESHOLD=$dt
MIN_OVERLAP=$mo
OUTPUT_DIR=$od
BEALIGN=$bealign
BAM2MSA=$bam2msa
TN93DIST=$tn93dist
HIVNETWORKCSV=$hivnetworkcsv
COMPARE_TO_LANL=$comparelanl
BOOTSTRAP=0

REFERENCE='HXB2_prrt'
SCORE_MATRIX='HIV_BETWEEN_F'
OUTPUT_FORMAT='CSV'
SEQUENCE_ID_FORMAT='plain'
AMBIGUITY_HANDLING='AVERAGE'

BAM_OUTPUT_SUFFIX='_output.bam'
FASTA_OUTPUT_SUFFIX='_output.fasta'
TN93_OUTPUT_SUFFIX='_user.tn93output.csv'
TN93_JSON_SUFFIX='_user.tn93output.json'
CLUSTER_JSON_SUFFIX='_user.cluster.json'
LANL_CLUSTER_JSON_SUFFIX='_lanl_user.cluster.json'

BAM_FN=$FN$BAM_OUTPUT_SUFFIX
OUTPUT_FASTA_FN=$FN$FASTA_OUTPUT_SUFFIX
OUTPUT_TN93_FN=$FN$TN93_OUTPUT_SUFFIX
JSON_TN93_FN=$FN$TN93_JSON_SUFFIX
OUTPUT_CLUSTER_JSON=$FN$CLUSTER_JSON_SUFFIX
STATUS_FILE=$FN"_status"

LANL_OUTPUT_CLUSTER_JSON=$FN$LANL_CLUSTER_JSON_SUFFIX
OUTPUT_USERTOLANL_TN93_FN=$FN"_usertolanl.tn93output.csv"
USER_LANL_TN93OUTPUT=$FN"_userlanl.tn93output.csv"
USER_FILTER_LIST=$FN"_user_filter.csv"

trap 'echo "error" >> $STATUS_FILE ; do_cleanup failed; exit' ERR

# PHASE 1
echo "Aligning">>$STATUS_FILE
$BEALIGN $FN $BAM_FN -r $REFERENCE -m $SCORE_MATRIX -R

# PHASE 2
echo "Converting to FASTA">>$STATUS_FILE
$BAM2MSA $BAM_FN $OUTPUT_FASTA_FN

# PHASE 3
echo "TN93 Analysis">>$STATUS_FILE
$TN93DIST $OUTPUT_FASTA_FN $OUTPUT_TN93_FN $DISTANCE_THRESHOLD $AMBIGUITY_HANDLING $OUTPUT_FORMAT $MIN_OVERLAP $BOOTSTRAP > $JSON_TN93_FN

# PHASE 4
echo "HIV Network Analysis">>$STATUS_FILE
$HIVNETWORKCSV -i $OUTPUT_TN93_FN -t $DISTANCE_THRESHOLD -f $SEQUENCE_ID_FORMAT -j > $OUTPUT_CLUSTER_JSON

if [ $COMPARE_TO_LANL = true ]; then

  # PHASE 5
  echo "Public Database TN93 Analysis">>$STATUS_FILE
  $TN93DIST $LANL_FASTA $OUTPUT_USERTOLANL_TN93_FN $DISTANCE_THRESHOLD $AMBIGUITY_HANDLING $OUTPUT_FORMAT $MIN_OVERLAP $BOOTSTRAP $OUTPUT_FASTA_FN

  #Perform concatenation
  cp $LANL_TN93OUTPUT_CSV $USER_LANL_TN93OUTPUT 
  tail -n+2 $OUTPUT_USERTOLANL_TN93_FN >> $USER_LANL_TN93OUTPUT
  tail -n+2 $OUTPUT_TN93_FN >> $USER_LANL_TN93OUTPUT

  # Create a list from TN93 csv for hivnetworkcsv filter
  tail -n +2 $OUTPUT_TN93_FN | awk -F , '{print $1"\n"$2}' | sort -u > $USER_FILTER_LIST

  # PHASE 6
  echo "Public Database HIV Network Analysis">>$STATUS_FILE
  $HIVNETWORKCSV -i $USER_LANL_TN93OUTPUT -t $DISTANCE_THRESHOLD -f $SEQUENCE_ID_FORMAT -j -k $USER_FILTER_LIST > $LANL_OUTPUT_CLUSTER_JSON

fi

echo "Completed">>$STATUS_FILE


