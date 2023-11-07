#!/bin/sh

EVM_CHAIN=ethereum
COSMOS_CHAIN=wasm

# 1. Add EVM chain
sh ./steps/01-add-chain.sh ${EVM_CHAIN}

# 2. Add cosmos-based chain
sh ./steps/02-add-cosmos-chain.sh ${COSMOS_CHAIN}

# 3. Register Broadcaster Account and Maintainer
sh ./steps/04-register-broadcaster.sh
