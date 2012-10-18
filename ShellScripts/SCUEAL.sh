export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf /home/datamonkey/Datamonkey/Analyses/SCUEAL/spool/$1*
mkdir /home/datamonkey/Datamonkey/Analyses/SCUEAL/spool/$1

#filename
#reference
#np

(echo $1; echo $2;) | mpirun -np $3 /usr/local/bin/HYPHYMPI /home/datamonkey/Datamonkey/Analyses/SCUEAL/SCUEAL.bf > Analyses/SCUEAL/hpout 2>&1 &
