DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf $ABS_DIR/Analyses/SCUEAL/spool/$1*
mkdir $ABS_DIR/Analyses/SCUEAL/spool/$1

#filename
#reference
#np

# Beowulf MPI
#(echo $1; echo $2;) | mpirun -np $3 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI $ABS_DIR/Analyses/SCUEAL/SCUEAL.bf > $ABS_DIR/Analyses/SCUEAL/hpout 2>&1 &

# OpenMPI
(echo $1; echo $2;) | mpirun -np $3 -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI $ABS_DIR/Analyses/SCUEAL/SCUEAL.bf > $ABS_DIR/Analyses/SCUEAL/hpout 2>&1 &
