# Axelar Local Dev: Sui Integration

Welcome to the Axelar Local Development Suite featuring Sui Integration. This package empowers developers to establish a local development environment for streamlined cross-chain communication utilizing the [Sui protocol](https://sui.io/). Currently, the integration facilitates general message passing exclusively with the EVM chain.

## Prequisites

Before you delve into the development, ensure you have the following components installed on your local machine:

- `sui`
- `sui-test-validator`

To set these up, adhere to the step-by-step guide provided by Sui, which can be accessed [here](https://docs.sui.io/build/sui-local-network#install-sui-from-github).

> **Note**: This package has been rigorously tested and found compatible with the [devnet-v1.8.1](https://github.com/MystenLabs/sui/releases/tag/devnet-v1.8.1) version.

## Initiating the Local Sui Network

To initiate the local Sui network, execute the command below in your terminal:

```
RUST_LOG="consensus=off" cargo run --bin sui-test-validator
```

## Usage Guidelines

Here, you'll find detailed guides that will assist you in various functionalities, including:

- [Relaying Transactions from EVM to Sui](./docs/evm_to_sui.md)
- [Relaying Transactions from Sui to EVM](./docs/sui_to_evm.md)
- [Developing a Sui Module](./docs/develop_sui_module.md)
