DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf $ABS_DIR/Analyses/ModelSelection/spool/$1.out
rm -rf $ABS_DIR/Analyses/ModelSelection/spool/$1.progress
STR=`beomap -np 21`
echo $STR

(echo $1; echo $2) |  mpirun -map $STR /opt/hyphy/HYPHY/HYPHYMPI USEPATH=`pwd`/dump/ $ABS_DIR/Analyses/ModelSelection/ModelSelection.bf
#> $ABS_DIR/Analyses/ModelSelection/hpout
