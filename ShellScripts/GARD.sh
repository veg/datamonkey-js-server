export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f /home/datamonkey/Datamonkey/Analyses/GARD/spool/$1*progress
rm -f /home/datamonkey/Datamonkey/Analyses/GARD/spool/$1*out
. $DIR/Globals.sh
#filename
#datatype (0 for nuc, 1 for prot)
#model description
#protein model frequency choice (0 for built-in, 1 for +F)
#rv choice (0 none, 1 - GDD, 2 - Beta+Gamma)
#number of rate classes


(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | mpirun -np 65 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI  USEPATH=/dev/null /home/datamonkey/Datamonkey/Analyses/GARD/GARD.bf  > Analyses/GARD/hpout 2>&1 &
