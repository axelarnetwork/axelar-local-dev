#!/bin/sh

EVM_CHAIN=ethereum
COSMOS_CHAIN=wasm
DIR="$(dirname "$0")"

echo "#### 1. Adding EVM chain ####"
sh "${DIR}/steps/01-add-evm-chain.sh" ${EVM_CHAIN}

echo "\n#### 2. Adding Cosmos chain ####"
sh "${DIR}/steps/02-add-cosmos-chain.sh" ${COSMOS_CHAIN}

echo "\n#### 3. Register Broadcaster ####"
sh "${DIR}/steps/03-register-broadcaster.sh"

echo "\n#### 4. Activate EVM Chains ####"
sh "${DIR}/steps/04-activate-evm-chain.sh" ${EVM_CHAIN}

echo "\n#### 5. Activate Cosmos Chains ####"
sh "${DIR}/steps/05-activate-cosmos-chain.sh" ${COSMOS_CHAIN}
