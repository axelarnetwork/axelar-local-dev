#!/bin/sh

DENOM=uaxl
CHAIN_ID=axelar
MONIKER=axelar
HOME=/root/private/.axelar

# Removing the existing directory to start with a clean slate
rm -rf ${HOME}

# Download the latest axelard binary
echo "Downloading axelard binary..."
wget https://github.com/axelarnetwork/axelar-core/releases/download/v0.34.1/axelard-linux-arm64-v0.34.1 -O axelard > /dev/null 2>&1 && echo "Downloaded axelard binary"

# Make the binary executable
chmod +x axelard
# Move the binary to the /usr/local/bin directory
mv axelard /usr/local/bin/axelard

# Initializing a new blockchain with identifier ${CHAIN_ID} in the specified home directory
axelard init "$MONIKER" --chain-id ${CHAIN_ID} --home ${HOME} > /dev/null 2>&1 && echo "Initialized new blockchain with chain ID ${CHAIN_ID}"

# edit the app.toml file to enable the API and swagger
sed -i '/\[api\]/,/\[/ s/enable = false/enable = true/' "$HOME"/config/app.toml
sed -i '/\[api\]/,/\[/ s/swagger = false/swagger = true/' "$HOME"/config/app.toml

# staking/governance token is hardcoded in config, change this
sed -i "s/\"stake\"/\"$DENOM\"/" "$HOME"/config/genesis.json && echo "Updated staking token to $DENOM"

# Adding a new key named 'owner' with a test keyring-backend in the specified home directory
# and storing the mnemonic in the mnemonic.txt file
mnemonic=$(axelard keys add owner --keyring-backend test --home ${HOME} 2>&1 | tail -n 1)
echo ${mnemonic} | tr -d "\n" > ${HOME}/mnemonic.txt
echo "Added new key 'owner'"

# Adding a new genesis account named 'owner' with an initial balance of 100000000stake in the blockchain
axelard add-genesis-account owner 100000000${DENOM} \
--home ${HOME} \
--keyring-backend test > /dev/null 2>&1 && echo "Added 'owner' to genesis account"

# Generating a new genesis transaction for 'owner' delegating 70000000${DENOM} in the blockchain with the specified chain-id
axelard gentx owner 70000000${DENOM} \
--home ${HOME} \
--keyring-backend test \
--moniker ${MONIKER} \
--chain-id ${CHAIN_ID} > /dev/null 2>&1 && echo "Generated genesis transaction for 'owner'"

# Collecting all genesis transactions to form the genesis block
axelard collect-gentxs \
--home ${HOME} > /dev/null 2>&1 && echo "Collected genesis transactions"

# Starting the blockchain node with the specified home directory
axelard start --home ${HOME} \
--minimum-gas-prices 0${DENOM} \
--moniker ${MONIKER} \
--rpc.laddr "tcp://0.0.0.0:26657"
