#!/bin/sh

EVM_CHAIN=ethereum
COSMOS_CHAIN=wasm
DIR="$(dirname "$0")"

# 1. Add EVM chain
echo "#### 1. Adding EVM chain ####"
sh "${DIR}/steps/01-add-chain.sh" ${EVM_CHAIN}

# 2. Add cosmos-based chain
echo "\n#### 2. Adding Cosmos chain ####"
sh "${DIR}/steps/02-add-cosmos-chain.sh" ${COSMOS_CHAIN}

# 3. Register Broadcaster Account and Maintainer
echo "\n#### 3. Register Broadcaster ####"
sh "${DIR}/steps/04-register-broadcaster.sh"
