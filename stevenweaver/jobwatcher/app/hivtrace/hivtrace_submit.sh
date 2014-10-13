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
COMPARE_TO_LANL=$comparelanl
HIVTRACE=$hivtrace
PYTHON=$python
STATUS_FILE=$fn"_status"

trap 'echo "Error" >> $STATUS_FILE ; do_cleanup failed; exit' ERR

#Call PYTHON SCRIPT
if [ $COMPARE_TO_LANL = true ]; then
    echo $PYTHON $HIVTRACE -i $FN -t $DISTANCE_THRESHOLD -m $MIN_OVERLAP -c
    $PYTHON $HIVTRACE -i $FN -t $DISTANCE_THRESHOLD -m $MIN_OVERLAP -c
else
    echo $PYTHON $HIVTRACE -i $FN -t $DISTANCE_THRESHOLD -m $MIN_OVERLAP
    $PYTHON $HIVTRACE -i $FN -t $DISTANCE_THRESHOLD -m $MIN_OVERLAP
fi
