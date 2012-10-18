export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f ../Analyses/BGM/$1.out
rm -f ../Analyses/BGM/$1.progress

(echo $1; echo $2; echo $3) | mpirun -np 51 /usr/local/bin/HYPHYMPI USEPATH=../Analyses/BGM/ ../Analyses/BGM/BGM2.bf > Analyses/BGM/hpout 2>&1 &
