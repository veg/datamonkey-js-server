DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
(echo $1; echo $2; echo $3;) | mpirun -np 33 -exclude $EXCLUDE_NODES bin/HYPHYMPI $ABS_DIR/Analyses/GABranch/GABranchDebug.bf USEPATH=/dev/null
