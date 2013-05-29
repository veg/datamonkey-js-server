DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f $ABS_DIR/Analyses/BGM/$1.out
rm -f $ABS_DIR/Analyses/BGM/$1.progress

(echo $1; echo $2; echo $3) | mpirun -np 51 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI USEPATH=$ABS_DIR/Analyses/BGM/ $ABS_DIR/Analyses/BGM/BGM2.bf > $ABS_DIR/Analyses/BGM/hpout 2>&1 &
