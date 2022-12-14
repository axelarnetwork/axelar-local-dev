# !/bin/bash

if ! command -v aptos &> /dev/null
then
    echo "aptos not found. skip building modules."
    exit
fi

aptos move compile --save-metadata --package-dir aptos/modules/test
