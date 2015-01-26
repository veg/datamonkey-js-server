DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh


EXCLUDE_NODES="0:1:2:3:4:5:6:7"

#filename
#tree mode
#genetic code
#posterior p

BASEPATH=$ABS_DIR/Analyses/PRIME/

(echo $1; echo $2) | /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_DOWNLOAD.bf >  ${BASEPATH}hpout 2>&1

# Beowulf MPI
#(echo $1; echo $3;) | /usr/bin/bpsh `beomap --nolocal --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf  > ${BASEPATH}hpout 2>&1
#(echo $1; echo $3;echo 0;echo $4;echo 1;echo $2;) | mpirun -map `beomap -np 193 --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1

#echo "/usr/bin/bpsh `beomap --nolocal --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf"
# OpenMPI
(echo $1; echo $3;) | /usr/bin/bpsh `beomap --nolocal --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf > ${BASEPATH}hpout 2>&1
(echo $1; echo $3;echo 0;echo $4;echo 1;echo $2;) | mpirun -np 193 -hostfile $HOSTFILE /usr/local/bin/HYPHYMPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1
