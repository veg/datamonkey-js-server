export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
(echo $1; echo $2; echo $3;) | mpirun -np 33 bin/HYPHYMPI Analyses/GABranch/GABranchDebug.bf USEPATH=/dev/null
