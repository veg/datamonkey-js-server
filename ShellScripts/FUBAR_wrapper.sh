DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

#filename
#tree mode
#genetic code
#posterior p

BASEPATH=$ABS_DIR/Analyses/FUBAR/

(echo $1; echo $2) | /usr/local/bin/HYPHYMP ${BASEPATH}FUBAR_Stage0.bf >  $ABS_DIR/Analyses/FUBAR/hpout 2>&1
(echo $1) | /usr/bin/bpsh `beomap --nolocal -exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMP ${BASEPATH}FUBAR_Stage1.bf  >  $ABS_DIR/Analyses/FUBAR/hpout 2>&1

# Beowulf MPI
#(echo $1; echo $3;) | mpirun -map `beomap -np 10 -exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMPI ${BASEPATH}FUBAR_Stage2.bf > $ABS_DIR/Analyses/FUBAR/hpout 2>&1
#(echo $1; echo 10;) | mpirun -map `beomap -np 10 -exclude $EXCLUDE_NODES` /usr/local/bin/HYPHYMPI ${BASEPATH}FUBAR_Stage3.bf > $ABS_DIR/Analyses/FUBAR/hpout 2>&1
#(echo $1; echo $4; echo $2; echo 10; echo $3; ) | mpirun -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI ${BASEPATH}FUBAR_Stage4.bf  > $ABS_DIR/Analyses/FUBAR/hpout 2>&1

# OpenMPI
(echo $1; echo $3;) | mpirun -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI ${BASEPATH}FUBAR_Stage2.bf > $ABS_DIR/Analyses/FUBAR/hpout 2>&1
(echo $1; echo 10;) | mpirun -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI ${BASEPATH}FUBAR_Stage3.bf > $ABS_DIR/Analyses/FUBAR/hpout 2>&1
(echo $1; echo $4; echo $2; echo 10; echo $3; ) | mpirun -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI ${BASEPATH}FUBAR_Stage4.bf  > $ABS_DIR/Analyses/FUBAR/hpout 2>&1
