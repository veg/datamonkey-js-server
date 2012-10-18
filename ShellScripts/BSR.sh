export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/

rm -f /home/datamonkey/Datamonkey/Analyses/BranchSiteREL/spool/$1*progress
rm -f /home/datamonkey/Datamonkey/Analyses/BranchSiteREL/spool/$1*out

(echo $1; echo $2; echo $3;) | /usr/bin/mpirun -np 33 /usr/local/bin/HYPHYMPI USEPATH=/home/datamonkey/Datamonkey/Analyses/BranchSiteREL/ /home/datamonkey/Datamonkey/Analyses/BranchSiteREL/BranchSiteRELTop.bf > Analyses/BranchSiteREL/hpout 2>&1 & 

