DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f $ABS_DIR/Analyses/UDS/spool/$1*

#(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7; echo $8; echo $9; echo ${10}; echo ${11}; echo ${12}; echo ${13}; echo ${14};) | mpirun -np 33 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI -d USEPATH=/dev/null USEPATH=/Analyses/UDS/ /home/datamonkey/datamonkey-server/Analyses/UDS/454_launcher_codon.bf 2>&1 
(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7; echo $8; echo $9; echo ${10}; echo ${11}; echo ${12}; echo ${13}; echo ${14};) |/usr/local/bin/HYPHYMP -d USEPATH=/dev/null USEPATH=$ABS_DIR/Analyses/UDS/  $ABS_DIR/Analyses/UDS/454_launcher_codon.bf 2>&1 
