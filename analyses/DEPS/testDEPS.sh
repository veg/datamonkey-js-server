export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f spool/$1*progress
rm -f spool/$1*out

#filename
#gencode table
#model description
#rv choice (0 none, 1 - GDD, 2 - Beta+Gamma)
#number of rate classes
#tree mode
#root on this node

(echo upload.628003226425821.1; echo 0; echo JTT; echo 1; echo 3; echo 0; echo EU514616;) | /usr/bin/mpirun -np 33 /opt/hyphy/HYPHY/HYPHYMPI BASEPATH=/opt/hyphy/HYPHY USEPATH=/home/datamonkey/Datamonkey/Analyses/DEPS/ /home/datamonkey/Datamonkey/Analyses/DEPS/DEPS.bf > hpout 2>&1 &
