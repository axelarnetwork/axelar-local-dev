#!/bin/sh

# Removing the existing .simapp directory to start with a clean slate
rm -rf ./private/.simapp

# Initializing a new blockchain with identifier test-chain-1 in the specified home directory
simd init test-chain --chain-id test-chain-1 --home ./private/.simapp > /dev/null 2>&1 && echo "Initialized new blockchain with chain ID test-chain-1"

# Copying the config files
cp ./config/*.toml ./private/.simapp/config/

# Adding a new key named 'alice' with a test keyring-backend in the specified home directory
simd keys add alice --keyring-backend test --home ./private/.simapp > /dev/null 2>&1 && echo "Added new key 'alice'"

# Adding a new genesis account named 'alice' with an initial balance of 100000000stake in the blockchain
simd genesis add-genesis-account alice 100000000stake \
  --home ./private/.simapp \
  --keyring-backend test > /dev/null 2>&1 && echo "Added 'alice' to genesis account"

# Generating a new genesis transaction for 'alice' delegating 70000000stake in the blockchain with the specified chain-id
simd genesis gentx alice 70000000stake \
  --home ./private/.simapp \
  --keyring-backend test \
  --chain-id test-chain-1 > /dev/null 2>&1 && echo "Generated genesis transaction for 'alice'"

# Collecting all genesis transactions to form the genesis block
simd genesis collect-gentxs \
    --home ./private/.simapp > /dev/null 2>&1 && echo "Collected genesis transactions"

# Starting the blockchain node with the specified home directory
simd start --home ./private/.simapp
