DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf $ABS_DIR/Analyses/ModelSelectionP/spool/$1.out
rm -rf $ABS_DIR/Analyses/ModelSelectionP/spool/$1.progress

# Beowulf MPI
#(echo $1;) |  mpirun -np 29 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI 29 USEPATH=$ABS_DIR/Analyses/ModelSelectionP/ $ABS_DIR/Analyses/ModelSelectionP/ModelSelectionP.bf > $ABS_DIR/Analyses/ModelSelectionP/hpout 2>&1 &

# OpenMPI
(echo $1;) |  mpirun -np 29 -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI 29 USEPATH=$ABS_DIR/Analyses/ModelSelectionP/ $ABS_DIR/Analyses/ModelSelectionP/ModelSelectionP.bf > $ABS_DIR/Analyses/ModelSelectionP/hpout 2>&1 &
