# !/bin/bash

if ! command -v aptos &> /dev/null
then
    echo "aptos not found. skip building modules."
    exit
fi

aptos move compile --save-metadata --bytecode-version 6 --package-dir __tests__/modules
