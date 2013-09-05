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
TN93DIST='/usr/local/bin/TN93dist'
HIVNETWORKCSV='/usr/local/bin/hivnetworkcsv'

OUTPUT_FORMAT='CSV'
SEQUENCE_ID_FORMAT='plain'
AMBIGUITY_HANDLING='AVERAGE'

BAM_OUTPUT_SUFFIX='_output.bam'
FASTA_OUTPUT_SUFFIX='_output.fasta'
TN93_OUTPUT_SUFFIX='_user.tn93output.csv'
CLUSTER_OUTPUT_SUFFIX='_lanl_user.cluster.csv'
GRAPH_OUTPUT_SUFFIX='_lanl_user.graph.dot'

OUTPUT_FASTA_FN=$FN$FASTA_OUTPUT_SUFFIX
OUTPUT_TN93_FN=$FN$TN93_OUTPUT_SUFFIX

LANL_OUTPUT_CLUSTER_CSV=$FN$CLUSTER_OUTPUT_SUFFIX
LANL_OUTPUT_GRAPH_DOT=$FN$GRAPH_OUTPUT_SUFFIX
STATUS_FILE=$FN"_lanl_status"

LANL_FASTA='/data/veg/hivcluster/example_files/LANL.FASTA'
LANL_TN93OUTPUT_CSV='/data/veg/hivcluster/example_files/LANL.TN93OUTPUT.csv'
OUTPUT_USERTOLANL_TN93_FN=$FN"_usertolanl.tn93output.csv"
USER_LANL_TN93OUTPUT=$FN"_userlanl.tn93output.csv"

trap 'echo "error" >> $STATUS_FILE ; do_cleanup failed; exit' ERR

# PHASE 1
echo "TN93 Analysis">>$STATUS_FILE
$TN93DIST $LANL_FASTA $OUTPUT_USERTOLANL_TN93_FN $DISTANCE_THRESHOLD $AMBIGUITY_HANDLING $OUTPUT_FORMAT $MIN_OVERLAP $BOOTSTRAP $OUTPUT_FASTA_FN

#Perform concatenation
cp $LANL_TN93OUTPUT_CSV $USER_LANL_TN93OUTPUT 
tail -n+2 $OUTPUT_USERTOLANL_TN93_FN >> $USER_LANL_TN93OUTPUT
tail -n+2 $OUTPUT_TN93_FN >> $USER_LANL_TN93OUTPUT

# PHASE 2
echo "HIV Network Analysis">>$STATUS_FILE
$HIVNETWORKCSV -i $USER_LANL_TN93OUTPUT -c $LANL_OUTPUT_CLUSTER_CSV -d $LANL_OUTPUT_GRAPH_DOT -t $DISTANCE_THRESHOLD -f $SEQUENCE_ID_FORMAT

echo "Completed">>$STATUS_FILE

