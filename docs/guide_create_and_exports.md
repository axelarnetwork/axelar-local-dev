# Running Crosschain Environment Separately

This guide demonstrates how to setup cross-chain evm environment and export evm rpc networks separately.

1. Create a script to start cross-chain environment

```ts
const outputPath = "" // Path to store chain configuration files with deployed contract addresses

await createAndExport({
  chainOutputPath: outputPath,
  accountsToFund: fundAddresses,
  callback: (chain, _info) => deployAndFundUsdc(chain, fundAddresses),
  chains: chains.length !== 0 ? chains : null,
  relayers,
  relayInterval: options.relayInterval,
});
```
