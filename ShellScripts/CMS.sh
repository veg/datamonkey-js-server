DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f $ABS_DIR/Analyses/CMS/spool/$1*progress
rm -f $ABS_DIR/Analyses/CMS/spool/$1*out

#echo "(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7; echo $8; echo $9; echo ${10}; ) | /usr/local/bin/HYPHYMPI 33  /Analyses/CMS/ModelSelectorCodon.bf" > /tmp/cms

#(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7; echo $8; echo $9; echo ${10}; ) | /usr/local/bin/HYPHYMPI 33  /Analyses/CMS/ModelSelectorCodon.bf > Analyses/CMS/hpout 2>&1 &
(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7; echo $8; echo $9; echo ${10}; ) | /usr/bin/mpirun -np 33 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI USEPATH=$ABS_DIR/Analyses/CMS/ $ABS_DIR/Analyses/CMS/ModelSelectorCodon.bf > $ABS_DIR/Analyses/CMS/hpout 2>&1 & 
