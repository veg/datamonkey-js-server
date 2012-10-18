export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f /home/datamonkey/Datamonkey/Analyses/EVF/spool/$1*progress
rm -f /home/datamonkey/Datamonkey/Analyses/EVF/spool/$1*out

(echo $1; echo $2; echo $3; echo $4; echo $5; ) | /usr/bin/mpirun -np 33 /usr/local/bin/HYPHYMPI USEPATH=/home/datamonkey/Datamonkey/Analyses/EVF/ /home/datamonkey/Datamonkey/Analyses/EVF/EVF.bf > Analyses/EVF/hpout 2>&1 & 

