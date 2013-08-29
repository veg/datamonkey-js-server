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

FN=$fn
DISTANCE_THRESHOLD=$dt
MIN_OVERLAP=$mo


OUTPUT_DIR='/home/sweaver/datamonkey/datamonkey-server/hivcluster/output/'
BEALIGN='/opt/share/python3.3/bealign'
BAM2MSA='/opt/share/python3.3/bam2msa'
TN93DIST='/usr/local/bin/TN93dist'
HIVNETWORKCSV='/usr/local/bin/hivnetworkcsv'

REFERENCE='HXB2_prrt'
SCORE_MATRIX='HIV_BETWEEN_F'
OUTPUT_FORMAT='CSV'
SEQUENCE_ID_FORMAT='plain'
AMBIGUITY_HANDLING='AVERAGE'

BAM_OUTPUT_SUFFIX='_output.bam'
FASTA_OUTPUT_SUFFIX='_output.fasta'
TN93_OUTPUT_SUFFIX='_user.tn93output.csv'
CLUSTER_OUTPUT_SUFFIX='_user.cluster.csv'
GRAPH_OUTPUT_SUFFIX='_user.graph.dot'

BAM_FN=$FN$BAM_OUTPUT_SUFFIX
OUTPUT_FASTA_FN=$FN$FASTA_OUTPUT_SUFFIX
OUTPUT_TN93_FN=$FN$TN93_OUTPUT_SUFFIX
OUTPUT_CLUSTER_CSV=$FN$CLUSTER_OUTPUT_SUFFIX
OUTPUT_GRAPH_DOT=$FN$GRAPH_OUTPUT_SUFFIX
STATUS_FILE=$FN"_status"

trap 'echo "error" >> $STATUS_FILE ; do_cleanup failed; exit' ERR

# PHASE 1
echo "Aligning">>$STATUS_FILE
$BEALIGN $FN $BAM_FN -r $REFERENCE -m $SCORE_MATRIX -R

# PHASE 2
echo "Converting to FASTA">>$STATUS_FILE
$BAM2MSA $BAM_FN $OUTPUT_FASTA_FN

# PHASE 3
echo "TN93 Analysis">>$STATUS_FILE
$TN93DIST $OUTPUT_FASTA_FN $OUTPUT_TN93_FN $DISTANCE_THRESHOLD $AMBIGUITY_HANDLING $OUTPUT_FORMAT $MIN_OVERLAP $BOOTSTRAP

# PHASE 4
echo "HIV Network Analysis">>$STATUS_FILE
$HIVNETWORKCSV -i $OUTPUT_TN93_FN -c $OUTPUT_CLUSTER_CSV -d $OUTPUT_GRAPH_DOT -t $DISTANCE_THRESHOLD -f $SEQUENCE_ID_FORMAT

echo "Completed">>$STATUS_FILE


