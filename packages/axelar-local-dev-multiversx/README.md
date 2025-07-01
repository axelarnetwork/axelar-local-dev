# Axelar Local Dev: MultiversX Integration

Welcome to the Axelar Local Development MultiversX featuring MultiversX Integration. This package empowers developers to establish a local development environment for streamlined cross-chain communication utilizing the [MultiversX protocol](https://multiversx.com/).
Currently, the integration facilitates general message passing exclusively with the EVM chain.

## Prerequisite

0. You should have Docker & Docker Compose installed.

1. Install Mxpy CLI Tool

Download from here: https://docs.multiversx.com/sdk-and-tools/sdk-py/installing-mxpy/

> **Note**: Our examples are tested on Mxpy version `9.4.1`, but newer versions might also work.

2. Run Elasticsearch

`dcker-compose up -d` (in this folder)

3. Create & run a MultiversX Localnet

More info: https://docs.multiversx.com/developers/setup-local-testnet

```bash
mkdir -p .multiversx && cd .multiversx
mxpy localnet setup
mxpy localnet start
```

Stop the localnet. You will now have `localnet` folder populate with the subfolders `validator00`, `validator01`, `validator02`.

Copy the [external.toml](external.toml) from this folder into all the validators `config` folder (eg full path: `.multiversx/localnet/validator00/config`)
and overwrite the existing file.

This will setup connection to Elasticsearch to index events used by the MultiversXRelayer.

Start again the localnet: `mxpy localnet start`

## Installation

To install this package, use the following command:

```bash
npm install @axelar-network/axelar-local-dev-multiversx
```

## Configuration

To set up the MultiversX chain stack with the EVM chain stack, you need to modify the `createAndExport` function in your script. Create an `MultiversXRelayer` instance and incorporate it with your existing EVM relayer. Here's an example:

```ts
const multiversxRelayer = new MultiversXRelayer();
const relayers = { evm: new EvmRelayer({ multiversxRelayer }), multiversx: multiversxRelayer };
```

For more details on setting up the `createAndExport` function, check our [Standalone Environment Setup Guide](../../docs/guide_create_and_exports.md).

## API Reference

`MultiversXNetwork` is a generalization of `ProxyNetworkProvider` (avaliable in the `@multiversx/sdk-network-providers` package) that includes (among others that are mainly used for intrnal purposes):

-   `deployAxelarFrameworkModules()`: Deploy Axelar related smart contracts found in `contracts`.
-   `deployContract(contractCode: string, initArguments: TypedValue[]): Promise<string>`: A wrapper for deploying a contract from code with init arguments, deployed by `alice.pem` wallet. Returns the SC address.
-   `signAndSendTransaction(transaction: Transaction, privateKey: UserSecretKey = this.ownerPrivateKey)`: A wrapper to easily sign, send and wait for a transaction to be completed.
-   `callContract(address: string, func: string, args: TypedValue[] = []): Promise<ContractQueryResponse>)`: A wrapper to easily query a smart contract.

Additionaly we export two utility functions

-   `createMultiversXNetwork(config?: {gatewayUrl: string})`: This deploys all the Axelar related smart contracts (`gas-service`, `auth`, `gateway`) if they are not deployed and saves their addresses to a config file. `gatewayUrl` defaults to `http://localhost:7950`
-   `loadMultiversXNetwork(gatewayUrl = 'http://localhost:7950')`: This loads the preconfigured `MultiversXNetwork` by reading the contract addresses from the config file. Needs to be used after `createMultiversXNetwork` was called at least once by a process.

`createAndExport` (see above) will try to also call `createMultiversXNetwork` so that relaying works to MultiversX as well.
