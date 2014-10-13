DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf $ABS_DIR/Analyses/ModelSelection/spool/$1.out
rm -rf $ABS_DIR/Analyses/ModelSelection/spool/$1.progress
(echo $1; echo $2) |  mpirun -np 41 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI $ABS_DIR/Analyses/ModelSelection/ModelSelection.bf > $ABS_DIR/Analyses/ModelSelection/hpout 2>&1 &
