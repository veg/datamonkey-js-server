DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f $ABS_DIR/Analyses/BranchSiteREL/spool/$1*progress
rm -f $ABS_DIR/Analyses/BranchSiteREL/spool/$1*out

(echo $1; echo $2; echo $3;) > /home/datamonkey/testout.bsr

(echo $1; echo $2; echo $3;) | /usr/bin/mpirun -np 33 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI USEPATH=$ABS_DIR/Analyses/BranchSiteREL/ $ABS_DIR/Analyses/BranchSiteREL/BranchSiteRELTop.bf > $ABS_DIR/Analyses/BranchSiteREL/hpout 2>&1 & 

