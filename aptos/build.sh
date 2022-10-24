# !/bin/bash

aptos move compile --save-metadata --package-dir aptos/modules/axelar_gas_service --named-addresses axelar=local
aptos move compile --save-metadata --package-dir aptos/modules/axelar_gateway --named-addresses axelar=local
