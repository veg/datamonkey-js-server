DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f  $ABS_DIR/Analyses/FEL/spool/$1*progress
rm -f  $ABS_DIR/Analyses/FEL/spool/$1*out

#file descriptor : upload.numbers.1
#tree mode: 0-3 (which tree to use)
#gencodeid: >=0 for a genetic code
#model description: six string (nucleotides) 
#default p-value    : a number between 0 and 1
#fel or ifel: 0 - FEL; 1 - IFEL

#(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | /usr/local/bin/HYPHYMPI 61 /Analyses/FEL/FEL.bf > Analyses/FEL/hpout 2>&1 &

#Beowulf MPI
#(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | mpirun -np 61 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI USEPATH=$ABS_DIR/Analyses/FEL/ $ABS_DIR/Analyses/FEL/FEL.bf  >  $ABS_DIR/Analyses/FEL/hpout 2>&1 & 

#OpenMPI
(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6) | mpirun -np 61 -hostfile $HOSTFILE /usr/local/bin/HYPHYMPI USEPATH=$ABS_DIR/Analyses/FEL/ $ABS_DIR/Analyses/FEL/FEL.bf  >  $ABS_DIR/Analyses/FEL/hpout 2>&1 & 
