#!/bin/bash

module load openmpi/gnu

#Absolute directory path
ABS_DIR="$( cd "$( dirname "${BASH_SOURCE[1]}" )" && cd ../ && pwd )"

#Excluded Nodes
EXCLUDE_NODES="0:1:2:3:4:5:6:32:33:34:35:36"
HOSTFILE="$DIR/hosts"
