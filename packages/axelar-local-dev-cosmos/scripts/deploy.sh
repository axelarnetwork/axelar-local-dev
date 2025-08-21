#!/bin/bash

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <network>"
    echo "Supported networks: avax, arb, sepolia, fuji, opt, pol"
    exit 1
fi

network=$1

deploy_contract() {
    local contract_path=$1
    local gateway_contract=$2
    local gas_service_contract=$3

    GATEWAY_CONTRACT="$gateway_contract" \
        GAS_SERVICE_CONTRACT="$gas_service_contract" \
        npx hardhat ignition deploy "$contract_path" --network "$network"
}

delete_deployments_folder() {
    local folder=$1
    if [ -d "$folder" ]; then
        echo "Deleting existing deployment folder: $folder"
        rm -rf "$folder"
    else
        echo "No existing deployment folder to delete: $folder"
    fi
}


# Mainnet and testnet contract addresses sourced from:
# Mainnet: https://docs.axelar.dev/dev/reference/mainnet-contract-addresses/
# Testnet: https://docs.axelar.dev/dev/reference/testnet-contract-addresses/
case $network in
avax)
    GATEWAY='0x5029C0EFf6C34351a0CEc334542cDb22c7928f78'
    GAS_SERVICE='0x2d5d7d31F671F86C782533cc367F14109a082712'
    ;;
arb)
    GATEWAY='0xe432150cce91c13a887f7D836923d5597adD8E31'
    GAS_SERVICE='0x2d5d7d31F671F86C782533cc367F14109a082712'
    ;;
sepolia)
    GATEWAY='0xe432150cce91c13a887f7D836923d5597adD8E31'
    GAS_SERVICE='0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6'
    ;;
fuji)
    GATEWAY='0xC249632c2D40b9001FE907806902f63038B737Ab'
    GAS_SERVICE='0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6'
    ;;
opt)
    GATEWAY='0xe432150cce91c13a887f7D836923d5597adD8E31'
    GAS_SERVICE='0x2d5d7d31F671F86C782533cc367F14109a082712'
    ;;
pol)
    GATEWAY='0x6f015F16De9fC8791b234eF68D486d2bF203FBA8'
    GAS_SERVICE='0x2d5d7d31F671F86C782533cc367F14109a082712'
    ;;
*)
    echo "Invalid network specified"
    exit 1
    ;;
esac

delete_deployments_folder "ignition/deployments"
deploy_contract "./ignition/modules/deployFactory.ts" "$GATEWAY" "$GAS_SERVICE"
