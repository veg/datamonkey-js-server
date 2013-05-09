DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f  $ABS_DIR/Analyses/FUBAR/spool/$1*

#filename
#tree mode
#genetic code
#posterior p

bash  $ABS_DIR/ShellScripts/FUBAR_wrapper.sh $1 $2 $3 $4 > /dev/null 2>&1 & 

