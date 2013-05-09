DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh


#filename
#tree mode
#genetic code
#posterior p

BASEPATH=/Analyses/PRIME/

(echo $1; echo $2) | /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_DOWNLOAD.bf >  ${BASEPATH}hpout 2>&1
(echo $1; echo $3;) | /usr/bin/bpsh `beomap --nolocal --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf  > ${BASEPATH}hpout 2>&1
(echo $1; echo $3;echo 0;echo $4;echo 1;echo $2;) | mpirun -map `beomap -np 193 --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1
