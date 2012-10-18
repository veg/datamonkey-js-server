export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f /home/datamonkey/Datamonkey/Analyses/REL/spool/$1*progress
rm -f /home/datamonkey/Datamonkey/Analyses/REL/spool/$1*out

(echo $1; echo $2; echo $3; echo $4; echo $5) | mpirun -np 10 /usr/local/bin/HYPHYMPI  USEPATH=/home/datamonkey/Datamonkey/Analyses/REL/ /home/datamonkey/Datamonkey/Analyses/REL/REL.bf  > Analyses/REL/hpout 2>&1 &
