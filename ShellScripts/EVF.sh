DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f $ABS_DIR/Analyses/EVF/spool/$1*progress
rm -f $ABS_DIR/Analyses/EVF/spool/$1*out

#Beowulf MPI
#(echo $1; echo $2; echo $3; echo $4; echo $5; ) | mpirun -np 33 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI USEPATH=$ABS_DIR/Analyses/EVF/ $ABS_DIR/Analyses/EVF/EVF.bf > $ABS_DIR/Analyses/EVF/hpout 2>&1 & 

#OpenMPI
(echo $1; echo $2; echo $3; echo $4; echo $5; ) | mpirun -np 33 -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI USEPATH=$ABS_DIR/Analyses/EVF/ $ABS_DIR/Analyses/EVF/EVF.bf > $ABS_DIR/Analyses/EVF/hpout 2>&1 & 
