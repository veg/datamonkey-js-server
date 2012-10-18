export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f ../Analyses/Toggle/spool/$1*progress
rm -f ../Analyses/Toggle/spool/$1*out

(echo $1; echo $2; echo $3; echo $4;) | mpirun -np 41 /usr/local/bin/HYPHYMPI  USEPATH=/dev/null USEPATH=../Analyses/Toggle/ ../Analyses/Toggle/FELtoggle.bf > Analyses/Toggle/hpout 2>&1 & 


