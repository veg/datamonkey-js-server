DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f  $ABS_DIR/Analyses/GABranch/spool/$1*progress
rm -f  $ABS_DIR/Analyses/GABranch/spool/$1*out
#(echo $1; echo $2; echo $3; echo $4)

# Beowulf MPI
#(echo $1; echo $2; echo $3; echo $4) | mpirun -np 33 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI USEPATH=/dev/null  $ABS_DIR/Analyses/GABranch/GABranch.bf >  $ABS_DIR/Analyses/GABranch/hpout 2>&1 &

# OpenMPI
(echo $1; echo $2; echo $3; echo $4) | mpirun -np 33 -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI USEPATH=/dev/null  $ABS_DIR/Analyses/GABranch/GABranch.bf >  $ABS_DIR/Analyses/GABranch/hpout 2>&1 &

