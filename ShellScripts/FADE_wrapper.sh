DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

#filename
#tree mode
#root on
#model name
#apply the FG model only to these nodes (ALL to use all)
#concentration parameter

BASEPATH=$ABS_DIR/Analyses/FADE/

(echo $1; echo $2; echo $3) | /usr/local/bin/HYPHYMP ${BASEPATH}FADE_DOWNLOAD.bf >  ${BASEPATH}hpout 2>&1
(echo $1; echo $4) | /usr/bin/bpsh `beomap --nolocal -exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP  ${BASEPATH}FADE_FIT_BG_MODEL.bf > ${BASEPATH}hpout 2>&1

# Beowulf MPI
#(echo $1; echo $5) | mpirun -np 25 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI ${BASEPATH}FADE_COMPUTE_GRID.bf > ${BASEPATH}hpout 2>&1
#(echo $1; echo $6) | mpirun -np 21 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI ${BASEPATH}FADE_ESTIMATE_WEIGHTS.bf > ${BASEPATH}hpout 2>&1

# OpenMPI
(echo $1; echo $5) | mpirun -np 25 -hostfile $HOSTFILE /usr/local/bin/HYPHYMPI ${BASEPATH}FADE_COMPUTE_GRID.bf > ${BASEPATH}hpout 2>&1
(echo $1; echo $6) | mpirun -np 21 -hostfile $HOSTFILE /usr/local/bin/HYPHYMPI ${BASEPATH}FADE_ESTIMATE_WEIGHTS.bf > ${BASEPATH}hpout 2>&1


(echo $1) | /usr/bin/bpsh `beomap --nolocal -exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP  ${BASEPATH}FADE_COMPUTE_POSTERIORS.bf > ${BASEPATH}hpout 2>&1

rm -f  ${BASEPATH}spool/$1.{weights,time,grid,baseFit,trees,seq}
 
