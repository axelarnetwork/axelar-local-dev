#!/bin/bash

# Get the directory of the current script
DIR="$(dirname "$0")"

# Remove the directory relative to the script's location
rm -rf "$DIR/../info"

docker kill $(docker ps -aq) > /dev/null 2>&1 || true
docker rm $(docker ps -aq) > /dev/null 2>&1 || true
