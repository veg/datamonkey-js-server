DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh


#filename
#tree mode
#genetic code
#posterior p

BASEPATH=$ABS_DIR/Analyses/PRIME/

module unload hyphy/2.2.6
module load openmpi/gnu/1.6.3

(echo $1; echo $2) | HYPHYMP USEPATH=$ABS_DIR/Analyses/PRIME/ ${BASEPATH}PRIME_DOWNLOAD.bf >  ${BASEPATH}hpout 2>&1

# Beowulf MPI
#(echo $1; echo $3;) | /usr/bin/bpsh `beomap --nolocal --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf  > ${BASEPATH}hpout 2>&1
#(echo $1; echo $3;echo 0;echo $4;echo 1;echo $2;) | mpirun -map `beomap -np 193 --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1

#echo "/usr/bin/bpsh `beomap --nolocal --exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf"
# OpenMPI
(echo $1; echo $3;) | /usr/bin/bpsh `beomap --nolocal --exclude $EXCLUDE_NODES` HYPHYMP ${BASEPATH}PRIME_FITGLOBAL.bf > ${BASEPATH}hpout 2>&1

#echo "(echo $1; echo $3;echo 0;echo $4;echo 1;echo $2;) | mpirun -np 193 -hostfile $PRIMEHOSTFILE HYPHYMPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1" > /home/datamonkey/prime_cmd.txt
(echo $1; echo $3;echo 0;echo $4;echo 1;echo $2;) | mpirun -np 193 -hostfile $PRIMEHOSTFILE HYPHYMPI ${BASEPATH}PRIME.bf > ${BASEPATH}hpout 2>&1

