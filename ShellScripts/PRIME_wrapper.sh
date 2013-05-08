
#filename
#tree mode
#genetic code
#posterior p

BASEPATH=/home/datamonkey/datamonkey-server/Analyses/PRIME/

(echo $1; echo $2) | /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_DOWNLOAD.bf >  ${BASEPATH}hpout 2>&1
(echo $1; echo $3;) | /usr/bin/bpsh `beomap --nolocal --exclude 0:1:2:3:4:5:31:32:33:34:35:36` /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf  > ${BASEPATH}hpout 2>&1
(echo $1; echo $3;echo 0;echo $4;echo 1;echo $2;) | mpirun -map `beomap -np 193 --exclude 0:1:2:3:4:5:31:32:33:34:35:36` /usr/local/bin/HYPHYMPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1
