DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f $ABS_DIR/Analyses/SBP/spool/$1*progress

#filename
#datatype (0 for nuc, 1 for prot)
#model description
#protein model frequency choice (0 for built-in, 1 for +F)
#rv choice (0 none, 1 - GDD, 2 - Beta+Gamma)
#number of rate classes

# Beowulf MPI
# (echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | mpirun -np 61 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI  USEPATH=/dev/null $ABS_DIR/Analyses/SBP/SBP.bf  > $ABS_DIR/Analyses/SBP/hpout 2>&1 &

# OpenMPI
(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | mpirun -np 61 -hostfile $HOSTFILE /usr/local/bin/HYPHYMPI  USEPATH=/dev/null $ABS_DIR/Analyses/SBP/SBP.bf  > $ABS_DIR/Analyses/SBP/hpout 2>&1 &
