#!/bin/bash

#Absolute directory path
ABS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd ../ && pwd )"

#Excluded Nodes
EXCLUDE_NODES="0:1:2:3:4:5:6:7"
HOSTFILE="$DIR/hosts"
