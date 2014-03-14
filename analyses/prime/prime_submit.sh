#!/bin/bash
export PATH=/usr/local/bin:$PATH

#FN=$fn
FN="/home/sweaver/datamonkey/datamonkey-server-prime/analyses/prime/spool/upload.166735581823650.1_531a65fac7bcb2341c000001"
STATUS_FILE=$fn"_status"
#TREEMODE=$treemode
TREEMODE=0
#GENETIC_CODE=$genetic_code
#POSTERIOR_P=$posterior_p

echo $FN >> $STATUS_FILE
echo "Completed" >> $STATUS_FILE

(echo $FN; echo $TREEMODE) | /usr/local/bin/HYPHYMP ./PRIME_DOWNLOAD.bf >  ./hpout 2>&1
#(echo $FN; echo $GENETIC_CODE;) | /usr/local/bin/HYPHYMP ./PRIME_FITGLOBAL.bf  > ./hpout 2>&1
#(echo $FN; echo $GENETIC_CODE;echo 0;echo $POSTERIOR_P;echo 1;echo $TREEMODE;) | /usr/local/bin/HYPHYMPI ./PRIME.bf > ./hpout 2>&1
echo "done"
