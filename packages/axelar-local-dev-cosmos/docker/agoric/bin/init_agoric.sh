#!/bin/sh

DENOM=ubld
CHAIN_ID=agoriclocal
MONIKER=agoric
HOME=/root/private/.agoric

CHAIN_DIR=/root/.agoric

# See https://github.com/Agoric/agoric-sdk/blob/7b684a6268c999b082a326fdb22f63e4575bac4f/packages/agoric-cli/src/chain-config.js#L66
RPC_MAX_BODY_BYTES=15000000
MAX_HEADER_BYTES=$((RPC_MAX_BODY_BYTES / 10))
MAX_TXS_BYTES=$((RPC_MAX_BODY_BYTES * 50))
sed -i -e "s/max_body_bytes = .*/max_body_bytes = $RPC_MAX_BODY_BYTES/g" $CHAIN_DIR/config/config.toml
sed -i -e "s/max_header_bytes = .*/max_header_bytes = $MAX_HEADER_BYTES/g" $CHAIN_DIR/config/config.toml
sed -i -e "s/max_txs_bytes = .*/max_txs_bytes = $MAX_TXS_BYTES/g" $CHAIN_DIR/config/config.toml
sed -i -e "s/max_tx_bytes = .*/max_tx_bytes = $RPC_MAX_BODY_BYTES/g" $CHAIN_DIR/config/config.toml
sed -i -e "s/^rpc-max-body-bytes =.*/rpc-max-body-bytes = $RPC_MAX_BODY_BYTES/" $CHAIN_DIR/config/app.toml

# Removing the existing directory to start with a clean slate
rm -rf ${HOME}/*
mnemonic="soap hub stick bomb dish index wing shield cruel board siren force glory assault rotate busy area topple resource okay clown wedding hint unhappy"
echo ${mnemonic} | tr -d "\n" >${HOME}/mnemonic.txt
echo "Added new key 'owner'"
