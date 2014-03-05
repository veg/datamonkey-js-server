DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf $ABS_DIR/Analyses/SCUEAL/spool/$1*
mkdir $ABS_DIR/Analyses/SCUEAL/spool/$1

#filename
#reference
#np

(echo $1; echo $2) | mpirun -np $3  /opt/hyphy/HYPHY/HYPHYMPI_DEBUG BASEPATH=/opt/hyphy/HYPHY/ $ABS_DIR/Analyses/SCUEAL/SCUEAL.bf
