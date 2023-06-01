## Axelar Local Dev: Aptos Integration

This package allows you to create a local development environment for cross-chain communication using the [Aptos](https://aptos.dev/) protocol. At present, we support general message passing with EVM chain but integration with `NEAR` is not currently supported.

## Installation

To install this package, use the following command:

```bash
npm install @axelar-network/axelar-local-dev-aptos
```

## Prerequisite

Before getting started, you'll need to install Aptos on your local machine.

1. **Install Aptos CLI Tool**

Download from here: https://aptos.dev/cli-tools/aptos-cli-tool/

_Note: Our examples are tested on Aptos version `1.0.4`._

2. **Run the Aptos Local Network**

Use the following command:

```bash
aptos node run-local-testnet --with-faucet --force-restart
```

## Configuration

To set up the Aptos chain stack with the EVM chain stack, you need to modify the `createAndExport` function in your script. Create an `AptosRelayer` instance and incorporate it with your existing EVM relayer. Here's an example:

```ts
const aptosRelayer = new AptosRelayer();
const relayers = { evm: new EvmRelayer({ aptosRelayer }), aptos: aptosRelayer };
```

For more details on setting up the `createAndExport` function, check our [Standalone Environment Setup Guide](../../docs/guide_create_and_exports.md).

## API Reference

`AptosNetwork` is a generalization of `AptosClient` (avaliable in the `aptos` package) that includes (among others that are mainly used for intrnal purposes):

-   `getResourceAccountAddress(MaybeHexString sourceAddress, MaybeHexString seed)`: Predicts the aptos resource address for an account with a certain seed.
-   `deploy(string modulePath , string[] compiledModules, MaybeHexString seed)`: Deploy `compiledModules` found in `modulePath`. Seed is optional, if it is included then the modules are deployed as a resource.
-   `submitTransactionAndWait(MaybeHexString from, EntryFunctionPayload txData)`: A wrapper for aptos' submit transaction workflow, for ease of use.

Additionaly we export two utility functions

-   `createAptosNetwork(config?: {nodeUrl: string, faucetUrl: string})`: This funds the `owner` account and uses it to deploy the gateway module. `nodeUrl` defaults to `http://localhost:8080` and `faucetUrl` defaults to `http://localhost:8081`
-   `loadAptosNetwork(string nodeUrl)`: This loads the an preconfigured `AptosNetwork`. It is useful so that relaying works properly to said aptos network works properly.

`createAndExport` (see above) will try to also call `createAptosNetwork` so that realying works to aptos as well.
