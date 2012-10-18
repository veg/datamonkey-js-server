export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf /home/datamonkey/Datamonkey/Analyses/SCUEAL/spool/$1*
mkdir /home/datamonkey/Datamonkey/Analyses/SCUEAL/spool/$1

#filename
#reference
#np

(echo $1; echo $2) | mpirun -np $3  /opt/hyphy/HYPHY/HYPHYMPI_DEBUG BASEPATH=/opt/hyphy/HYPHY/ /home/datamonkey/Datamonkey/Analyses/SCUEAL/SCUEAL.bf
