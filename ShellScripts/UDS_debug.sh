export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f ../Analyses/UDS/spool/$1*

(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7; echo $8; echo $9; echo ${10}; echo ${11}; echo ${12}; echo ${13}; echo ${14};) | mpirun -np 101 /usr/local/bin/HYPHYMPI  USEPATH=/dev/null USEPATH=../Analyses/UDS/ ../Analyses/UDS/454_launcher_codon.bf 