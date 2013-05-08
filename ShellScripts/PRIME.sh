export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f Analyses/PRIME/spool/$1*

#filename
#tree mode
#genetic code
#posterior p

bash /home/datamonkey/datamonkey-server/ShellScripts/PRIME_wrapper.sh $1 $2 $3 $4 $5 $6> /dev/null 2>&1 & 


