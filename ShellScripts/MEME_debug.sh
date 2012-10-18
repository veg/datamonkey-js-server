export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f ../Analyses/MEME/spool/$1*progress
rm -f ../Analyses/MEME/spool/$1*out

#file descriptor : upload.numbers.1
#tree mode: 0-3 (which tree to use)
#gencodeid: >=0 for a genetic code
#model description: six string (nucleotides) 
#default p-value    : a number between 0 and 1


#(echo $1; echo $2; echo $3; echo $4; echo $5;) | mpirun -np 61 /opt/hyphy/HYPHY/HYPHYMPI -d BASEPATH=/opt/hyphy/HYPHY/ USEPATH=../Analyses/MEME/ ../Analyses/MEME/MEME.bf 

mpirun -np 61 /opt/hyphy/HYPHY/HYPHYMPI -d BASEPATH=/opt/hyphy/HYPHY/ USEPATH=../Analyses/MEME/ ../Analyses/MEME/MEME.bf 