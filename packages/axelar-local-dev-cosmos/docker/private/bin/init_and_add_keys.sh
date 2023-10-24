#!/bin/sh

DENOM=${DENOM:-udemo}
CHAIN_ID=${CHAIN_ID:-demo-chain}
MONIKER=${MONIKER:-demo-chain}
HOME=/root/private/.${CHAIN_ID}

# Removing the existing .simapp directory to start with a clean slate
rm -rf ${HOME}

# Initializing a new blockchain with identifier ${CHAIN_ID} in the specified home directory
wasmd init "$MONIKER" --chain-id ${CHAIN_ID} --home ${HOME} > /dev/null 2>&1 && echo "Initialized new blockchain with chain ID ${CHAIN_ID}"

# this is essential for sub-1s block times (or header times go crazy)
sed -i 's/"time_iota_ms": "1000"/"time_iota_ms": "10"/' "$HOME"/config/genesis.json

# staking/governance token is hardcoded in config, change this
sed -i "s/\"stake\"/\"$DENOM\"/" "$HOME"/config/genesis.json && echo "Updated staking token to $DENOM"

# Copying the config files
cp /root/config/*.toml ${HOME}/config/

# Adding a new key named 'owner' with a test keyring-backend in the specified home directory
# and storing the mnemonic in the mnemonic.txt file
mnemonic=$(wasmd keys add owner --keyring-backend test --home ${HOME} 2>&1 | tail -n 1)
echo ${mnemonic} | tr -d "\n" > ${HOME}/mnemonic.txt
echo "Added new key 'owner'"

# Adding a new genesis account named 'owner' with an initial balance of 100000000stake in the blockchain
wasmd genesis add-genesis-account owner 100000000${DENOM} \
--home ${HOME} \
--keyring-backend test > /dev/null 2>&1 && echo "Added 'owner' to genesis account"

# Generating a new genesis transaction for 'owner' delegating 70000000${DENOM} in the blockchain with the specified chain-id
wasmd genesis gentx owner 70000000${DENOM} \
--home ${HOME} \
--keyring-backend test \
--moniker ${MONIKER} \
--chain-id ${CHAIN_ID} > /dev/null 2>&1 && echo "Generated genesis transaction for 'owner'"

# Collecting all genesis transactions to form the genesis block
wasmd genesis collect-gentxs \
--home ${HOME} > /dev/null 2>&1 && echo "Collected genesis transactions"


# Starting the blockchain node with the specified home directory
wasmd start --home ${HOME} --minimum-gas-prices 0${DENOM} --moniker ${MONIKER}
