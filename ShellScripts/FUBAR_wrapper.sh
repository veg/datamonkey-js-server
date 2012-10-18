
#filename
#tree mode
#genetic code
#posterior p

BASEPATH=../Analyses/FUBAR/

(echo $1; echo $2) | /usr/local/bin/HYPHYMP ${BASEPATH}FUBAR_Stage0.bf > Analyses/FUBAR/hpout 2>&1
(echo $1) | /usr/bin/bpsh `beomap --nolocal` /usr/local/bin/HYPHYMP ${BASEPATH}FUBAR_Stage1.bf  > Analyses/FUBAR/hpout 2>&1
(echo $1; echo $3;) | mpirun -map `beomap --all-nodes` /usr/local/bin/HYPHYMPI ${BASEPATH}FUBAR_Stage2.bf > Analyses/FUBAR/hpout 2>&1
(echo $1; echo 10;) | mpirun -map `beomap -np 10` /usr/local/bin/HYPHYMPI ${BASEPATH}FUBAR_Stage3.bf > Analyses/FUBAR/hpout 2>&1
(echo $1; echo $4; echo $2; echo 10; echo $3; ) | mpirun -map `beomap --all-nodes`  /usr/local/bin/HYPHYMPI ${BASEPATH}FUBAR_Stage4.bf  > Analyses/FUBAR/hpout 2>&1
