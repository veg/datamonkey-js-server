export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f ../Analyses/PARRIS/$1.progress
rm -f ../Analyses/PARRIS/$1.out

(echo $1; echo $2; echo $3; echo $4; echo $5;) | mpirun -np 10 /usr/local/bin/HYPHYMPI USEPATH=../Analyses/PARRIS/ ../Analyses/PARRIS/PARRIS.bf > Analyses/PARRIS/hpout 2>&1 &
