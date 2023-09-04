# Axelar Local Dev: Sui Integration

This package allows you to create a local development environment for cross-chain communication using the [Sui](https://sui.io/) protocol. At present, we support general message passing only with EVM chain

## Prequisite

You'll have to install `sui` and `sui-test-validator` in your local machine.

To do this, please follow the guide from Sui [here](https://docs.sui.io/build/sui-local-network#install-sui-from-github)

> Note: This package has tested against version [devnet-v1.8.1](https://github.com/MystenLabs/sui/releases/tag/devnet-v1.8.1).

## Running Local Sui Network

To start running local sui network, run the following command.

```
RUST_LOG="consensus=off" cargo run --bin sui-test-validator
```

## Usage

1. [Relay Transaction From Evm to Sui](./docs/evm_to_sui.md)
2. [Relay Transaction From Sui to Evm](./docs/sui_to_evm.md)
