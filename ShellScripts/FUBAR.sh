export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
rm -f Analyses/FUBAR/spool/$1*

#filename
#tree mode
#genetic code
#posterior p

bash ../ShellScripts/FUBAR_wrapper.sh $1 $2 $3 $4 > /dev/null 2>&1 & 


