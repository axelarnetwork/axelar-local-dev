#!/bin/bash

# This script is used to verify any Wallet contract
# By verifying a wallet contract, we can attach its source code to a public
# explorer (e.g snowtrace) which can be used later by a debugger (e.g tenderly) to make
# a human readable stack trace. This is helpful for figuring out why a 
# certain contract call failed.
#
# For verification we will need:
# 1. The address of the contract
# 2. The owner address (an agoric bech32 address) of the contract
# the second argument can be found by decoding the `SmartWalletCreated`
# event of the tx that created the contract in the first place
# e.g https://testnet.snowtrace.io/tx/0x0de743f69831ae404925307d1c25af941c276ccffdc6713db886ae4ec688f1e0/eventlog?chainid=43113


# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/network-config.sh"

if [[ $# -lt 3 ]]; then
    echo "Usage: $0 <network> <wallet_address> <owner>"
    echo "Supported networks:"
    echo "  Mainnets: avax, arb, opt, pol"
    echo "  Testnets: eth-sepolia, fuji, base-sepolia, opt-sepolia, arb-sepolia"
    echo ""
    echo "Example:"
    echo "  $0 fuji 0x123... agoric1..."
    exit 0
fi

network=$1
wallet_address=$2
owner=$3

get_network_config "$network"

echo "Verifying Wallet contract at: $wallet_address"
echo "Network: $network"
echo "Gateway: $GATEWAY"
echo "Gas Service: $GAS_SERVICE"
echo "Owner: $owner"

npx hardhat verify --network "$network" \
    "$wallet_address" \
    "$GATEWAY" \
    "$GAS_SERVICE" \
    "$owner" \
    --contract "src/__tests__/contracts/Factory.sol:Wallet"
