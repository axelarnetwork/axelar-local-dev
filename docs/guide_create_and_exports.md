# Running a Separate Crosschain Environment

This guide illustrates how to set up a cross-chain EVM environment and independently export EVM RPC networks.

## Prerequisites

1. You need to have an understanding of EVM-based chains.
2. Knowledge of TypeScript is necessary.

## Steps

### 1. Setup the Crosschain Environment

To do this, you need to create a script for initializing the cross-chain environment. This script will run separately.

```ts
// Define the path where chain configuration files with deployed contract addresses will be stored
const outputPath = "";

// A list of addresses to be funded with the native token
const fundAddresses = ["0x1..", "0x2.."];

// A callback function that takes a Network object and an info object as parameters
// The info object should look similar to this file: https://github.com/axelarnetwork/axelar-cgp-solidity/blob/main/info/testnet.json.
const callback = (chain: Network, info: any) => {};

// A list of EVM chain names to be initialized
const chains = ["Avalanche", "Ethereum", "Fantom"];

// Define the chain stacks that the networks will relay transactions between
const relayers = { evm: new EvmRelayer() };

// Here we are setting up for EVM chains only. If you want to add more networks like NEAR, you have to create a new instance of the relayer for that network,
// and then include it in your relayers object. Each relayer should be aware of the others to facilitate transactions between them.
// For example, if you want to relay transactions between EVM and Near network, you have to set it like this
// const nearRelayer = new NearRelayer()
const relayers = { evm: new EvmRelayer({ nearRelayer }), near: nearRelayer }

// Number of milliseconds to periodically trigger the relay function and send all pending crosschain transactions to the destination chain
const relayInterval = 5000

// A port number for the RPC endpoint. The endpoint for each chain can be accessed by the 0-based index of the chains array.
// For example, if your chains array is ["Avalanche", "Fantom", "Moonbeam"], then http://localhost:8500/0 is the endpoint for the local Avalanche chain.
const port = 8500

await createAndExport({
  chainOutputPath: outputPath,
  accountsToFund: fundAddresses,
  callback: (chain, _info) => deployAndFundUsdc(chain, fundAddresses),
  chains: chains.length !== 0 ? chains : null,
  relayInterval: options.relayInterval,
  relayers,
  port;
});
```

## 2. Connect EVM Client

With the environment set up, you can now connect your EVM client with the exposed RPC port and commence development. For a practical example, check out [axelar-examples](https://github.com/axelarnetwork/axelar-examples/blob/32487be8203bf681a1b944a67b7ebb81a0c45bc1/scripts/libs/start.js#L19-L25).

Happy developing!
