export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f ../Analyses/FEL/spool/$1*progress
rm -f ../Analyses/FEL/spool/$1*out

#file descriptor : upload.numbers.1
#tree mode: 0-3 (which tree to use)
#gencodeid: >=0 for a genetic code
#model description: six string (nucleotides) 
#default p-value    : a number between 0 and 1
#fel or ifel: 0 - FEL; 1 - IFEL


#(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | /usr/local/bin/HYPHYMPI 61 ../Analyses/FEL/FEL.bf > Analyses/FEL/hpout 2>&1 &
(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | mpirun -np 61 /usr/local/bin/HYPHYMPI USEPATH=../Analyses/FEL/ ../Analyses/FEL/FEL.bf  > Analyses/FEL/hpout 2>&1 & 
