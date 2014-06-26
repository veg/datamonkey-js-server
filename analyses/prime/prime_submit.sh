#!/bin/bash
#PBS -l nodes=30:ppn=8

export PATH=/usr/local/bin:$PATH

FN=$fn
STATUS_FILE=$sfn
TREEMODE=$treemode
GENETIC_CODE=$genetic_code
POSTERIOR_P=$posterior_p
MSAID=$msaid

trap 'echo "Error" >> $STATUS_FILE; exit' ERR
(echo $FN; echo $TREEMODE; echo $MSAID) | /usr/local/bin/HYPHYMP ./PRIME_DOWNLOAD.bf > ./hpout 2>&1
(echo `basename $FN`; echo $GENETIC_CODE;) | /usr/local/bin/HYPHYMP ./PRIME_FITGLOBAL.bf  > ./hpout 2>&1
(echo `basename $FN`; echo $GENETIC_CODE;echo 0;echo $POSTERIOR_P;echo 1;echo $TREEMODE;) | /usr/local/bin/HYPHYMPI ./PRIME.bf > ./hpout 2>&1
echo "Completed" >> $STATUS_FILE
