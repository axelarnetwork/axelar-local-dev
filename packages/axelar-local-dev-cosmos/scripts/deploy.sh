#!/bin/bash

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/network-config.sh"

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <network>"
    echo "Supported networks:"
    echo "  Mainnets: avax, arb, base, eth, opt, pol"
    echo "  Testnets: eth-sepolia, fuji, base-sepolia, opt-sepolia, arb-sepolia"
    exit 0
fi

network=$1

deploy_contract() {
    local contract_path=$1
    local gateway_contract=$2
    local gas_service_contract=$3
    local permit2_contract=$4

    GATEWAY_CONTRACT="$gateway_contract" \
        GAS_SERVICE_CONTRACT="$gas_service_contract" \
        PERMIT2_CONTRACT="$permit2_contract" \
        npx hardhat ignition deploy "$contract_path" --network "$network" --verify
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

get_network_config "$network"

delete_deployments_folder "ignition/deployments"
deploy_contract "./ignition/modules/deployFactoryFactory.ts" "$GATEWAY" "$GAS_SERVICE" "$PERMIT2"
