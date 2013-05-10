DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &&  pwd )"
. $DIR/Globals.sh

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib/
(echo $1; echo $2;) |  /usr/local/bin/HYPHYMP `pwd`/Analyses/BGM/BGM.bf USEPATH=/dev/null > Analyses/BGM/hpout 2>&1 &
