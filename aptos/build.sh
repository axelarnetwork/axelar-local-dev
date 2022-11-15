# !/bin/bash

aptos move compile --save-metadata --package-dir aptos/modules/axelar-framework
aptos move compile --save-metadata --package-dir aptos/modules/test
