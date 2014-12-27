DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f  $ABS_DIR/Analyses/MEME/spool/$1*progress
rm -f  $ABS_DIR/Analyses/MEME/spool/$1*out

#file descriptor : upload.numbers.1
#tree mode: 0-3 (which tree to use)
#gencodeid: >=0 for a genetic code
#model description: six string (nucleotides) 
#default p-value    : a number between 0 and 1

# Beowulf MPI
#(echo $1; echo $2; echo $3; echo $4; echo $5;) | mpirun -np 97 -exclude $EXCLUDE_NODES /usr/local/bin/HYPHYMPI USEPATH=$ABS_DIR/Analyses/MEME/ $ABS_DIR/Analyses/MEME/MEME_new.bf >  $ABS_DIR/Analyses/MEME/hpout 2>&1 

# OpenMPI
(echo $1; echo $2; echo $3; echo $4; echo $5;) | mpirun -nolocal -np 97 -hostfile $HOSTFILE /usr/local/bin/HYPHYOPENMPI USEPATH=$ABS_DIR/Analyses/MEME/ $ABS_DIR/Analyses/MEME/MEME_new.bf >  $ABS_DIR/Analyses/MEME/hpout 2>&1 

