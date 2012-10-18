export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf Analyses/ModelSelection/spool/$1.out
rm -rf Analyses/ModelSelection/spool/$1.progress
(echo $1; echo $2) |  mpirun -np 41 /usr/local/bin/HYPHYMPI /home/datamonkey/Datamonkey/Analyses/ModelSelection/ModelSelection.bf > Analyses/ModelSelection/hpout 2>&1 &
