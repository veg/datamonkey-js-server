DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f  $ABS_DIR/Analyses/FADE/spool/$1*

#filename
#tree mode
#root on
#model name
#apply the FG model only to these nodes (ALL to use all)
#concentration parameter


bash  $ABS_DIR/ShellScripts/FADE_wrapper.sh $1 $2 $3 $4 $5 $6 > /dev/null 2>&1 & 

