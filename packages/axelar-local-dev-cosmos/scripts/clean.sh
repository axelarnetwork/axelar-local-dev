#!/bin/bash

# Get the directory of the current script
DIR="$(dirname "$0")"

# Remove the directory relative to the script's location
rm -rf "$DIR/../info"
