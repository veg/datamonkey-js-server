export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f /home/datamonkey/Datamonkey/Analyses/BGM/$1.out
rm -f /home/datamonkey/Datamonkey/Analyses/BGM/$1.progress

(echo $1; echo $2; echo $3) | mpirun -np 51 /usr/local/bin/HYPHYMPI USEPATH=/home/datamonkey/Datamonkey/Analyses/BGM/ /home/datamonkey/Datamonkey/Analyses/BGM/BGM2.bf > Analyses/BGM/hpout 2>&1 &
