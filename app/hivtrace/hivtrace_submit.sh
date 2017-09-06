#!/bin/bash
#PBS -l nodes=1:ppn=32

#  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.
#
#  Copyright (C) 2015
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
AMBIGUITY=$ambiguity_handling
FRACTION=$fraction
REFERENCE=$reference
DISTANCE_THRESHOLD=$dt
MIN_OVERLAP=$mo
STRIP_DRAMS=$strip_drams
COMPARE_TO_LANL=$comparelanl
FILTER_EDGES=$filter
PYTHON=$python
REFERENCE_STRIP=$reference_strip
STATUS_FILE=$fn"_status"
HIVTRACE=$hivtrace
OUTPUT=$output
PREALIGNED=$prealigned
HIVTRACE_LOG=$hivtrace_log

trap 'echo "Error" >> $STATUS_FILE ; do_cleanup failed; exit' ERR

#Call PYTHON SCRIPT
ARGS=('-i' $FN '-a' $AMBIGUITY '-r' $REFERENCE '-t' $DISTANCE_THRESHOLD '-m' $MIN_OVERLAP '-g' $FRACTION '-s' $STRIP_DRAMS '-f' $FILTER_EDGES '-u' $REFERENCE_STRIP '--log' $HIVTRACE_LOG)

if [ $COMPARE_TO_LANL = true ]; then
  ARGS+=('-c')
fi

if [ $PREALIGNED = true ]; then
  ARGS+=('--skip-alignment')
fi

ARGS=$(printf " %s" "${ARGS[@]}") 

echo $PYTHON $HIVTRACE $ARGS
$PYTHON $HIVTRACE $ARGS > $OUTPUT
