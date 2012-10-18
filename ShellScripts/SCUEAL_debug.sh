export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf ../Analyses/SCUEAL/spool/$1*
mkdir ../Analyses/SCUEAL/spool/$1

#filename
#reference
#np

(echo $1; echo $2) | mpirun -np $3  /opt/hyphy/HYPHY/HYPHYMPI_DEBUG BASEPATH=/opt/hyphy/HYPHY/ ../Analyses/SCUEAL/SCUEAL.bf
