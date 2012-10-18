export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -rf Analyses/ModelSelection/spool/$1.out
rm -rf Analyses/ModelSelection/spool/$1.progress
STR=`beomap -np 21`
echo $STR

(echo $1; echo $2) |  mpirun -map $STR /opt/hyphy/HYPHY/HYPHYMPI USEPATH=`pwd`/dump/ ../Analyses/ModelSelection/ModelSelection.bf
#> Analyses/ModelSelection/hpout
