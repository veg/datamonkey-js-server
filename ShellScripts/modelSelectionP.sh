export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf Analyses/ModelSelectionP/spool/$1.out
rm -rf Analyses/ModelSelectionP/spool/$1.progress
(echo $1;) |  mpirun -np 29 /usr/local/bin/HYPHYMPI 29 USEPATH=/home/datamonkey/Datamonkey/Analyses/ModelSelectionP/ /home/datamonkey/Datamonkey/Analyses/ModelSelectionP/ModelSelectionP.bf > Analyses/ModelSelectionP/hpout 2>&1 &

