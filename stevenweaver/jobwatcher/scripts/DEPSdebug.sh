DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

#echo "rm -f /Analyses/DEPS/spool/$1*progress"

rm -f $ABS_DIR/Analyses/DEPS/spool/$1*progress
rm -f $ABS_DIR/Analyses/DEPS/spool/$1*out

#filename
#datatype (0 for nuc, 1 for prot)
#model description
#rv choice (0 none, 1 - GDD, 2 - Beta+Gamma)
#number of rate classes
#tree mode
#root on this node

(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7;) | /usr/local/bin/HYPHYDEBUG USEPATH=$ABS_DIR/Analyses/DEPS/ $ABS_DIR/Analyses/DEPS/DEPS.bf 
