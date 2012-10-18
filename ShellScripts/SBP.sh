export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f Analyses/SBP/spool/$1*progress

#filename
#datatype (0 for nuc, 1 for prot)
#model description
#protein model frequency choice (0 for built-in, 1 for +F)
#rv choice (0 none, 1 - GDD, 2 - Beta+Gamma)
#number of rate classes


(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | mpirun -np 61 /usr/local/bin/HYPHYMPI  USEPATH=/dev/null /home/datamonkey/Datamonkey/Analyses/SBP/SBP.bf  > Analyses/SBP/hpout 2>&1 &
