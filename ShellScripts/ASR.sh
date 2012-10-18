export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f Analyses/ASR/spool/$1*progress
rm -f Analyses/ASR/spool/$1*out

#filename
#datatype (0 for nuc, 1 for prot)
#model description
#protein model frequency choice (0 for built-in, 1 for +F)
#rv choice (0 none, 1 - GDD, 2 - Beta+Gamma)
#number of rate classes
#tree mode
#root on this node


(echo $1; echo $2; echo $3; echo $4; echo $5; echo $6; echo $7; echo $8) | /usr/local/bin/HYPHYMP ../Analyses/ASR/ASR.bf > Analyses/ASR/hpout 2>&1 &
