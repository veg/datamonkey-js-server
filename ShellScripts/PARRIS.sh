export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f /home/datamonkey/Datamonkey/Analyses/PARRIS/$1.progress
rm -f /home/datamonkey/Datamonkey/Analyses/PARRIS/$1.out

(echo $1; echo $2; echo $3; echo $4; echo $5;) | mpirun -np 10 /usr/local/bin/HYPHYMPI USEPATH=/home/datamonkey/Datamonkey/Analyses/PARRIS/ /home/datamonkey/Datamonkey/Analyses/PARRIS/PARRIS.bf > Analyses/PARRIS/hpout 2>&1 &
