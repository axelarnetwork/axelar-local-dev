#!/bin/sh

HOME=./private/.${CHAIN_NAME}

# Removing the existing .simapp directory to start with a clean slate
rm -rf ${HOME}

# Initializing a new blockchain with identifier ${CHAIN_NAME} in the specified home directory
simd init test-chain --chain-id ${CHAIN_NAME} --home ${HOME} > /dev/null 2>&1 && echo "Initialized new blockchain with chain ID ${CHAIN_NAME}"

# Copying the config files
cp ./config/*.toml ${HOME}/config/

# Adding a new key named 'owner' with a test keyring-backend in the specified home directory
simd keys add owner --keyring-backend test --home ${HOME} > /dev/null 2>&1 && echo "Added new key 'owner'"

# Adding a new genesis account named 'owner' with an initial balance of 100000000stake in the blockchain
simd genesis add-genesis-account owner 100000000stake \
  --home ${HOME} \
  --keyring-backend test > /dev/null 2>&1 && echo "Added 'owner' to genesis account"

# Generating a new genesis transaction for 'owner' delegating 70000000stake in the blockchain with the specified chain-id
simd genesis gentx owner 70000000stake \
  --home ${HOME} \
  --keyring-backend test \
  --chain-id ${CHAIN_NAME} > /dev/null 2>&1 && echo "Generated genesis transaction for 'owner'"

# Collecting all genesis transactions to form the genesis block
simd genesis collect-gentxs \
    --home ${HOME} > /dev/null 2>&1 && echo "Collected genesis transactions"

# Output the mnemonic to HOME directory
simd keys mnemonic --home ${HOME} > ${HOME}/mnemonic.txt

# Starting the blockchain node with the specified home directory
simd start --home ${HOME}
