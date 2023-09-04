## Relay from EVM to Sui

In this guide, we demonstrate how to facilitate a transaction relay from an EVM network to the Sui network. We will walk through the steps of initializing relayers, deploying contracts and modules, and finally executing a function on the EVM contract and relaying the transaction to the Sui network.

### Step 1: Import Necessary Packages

```ts
import { createSuiRelayer, RelayerType } from '@axelar-network/axelar-local-dev-sui';
import { ethers } from 'ethers';
```

### Step 2: Initialize Sui and EVM Relayers

Initialize the Sui and EVM relayers to set up the communication between the networks.

```ts
const { suiRelayer, suiClient } = await initSui();
const evmRelayer = new EvmRelayer();

// Establish the EVM relayer to Sui relayer connection to enable transaction relays to the Sui network.
evmRelayer.setRelayer(RelayerType.sui, suiRelayer);
```

## Step 3: Create an EVM Network

Create a new EVM network, here named "Evm1", to deploy your contracts.

```ts
const evmNetwork = await createNetwork({
    name: 'Evm1',
});
```

## Step 4: Deploy a Contract on the EVM Network

Deploy a contract on the newly created EVM network using the necessary executable file.

```ts
const Executable = require('path/to/contract_json');
const evmContract = await deployContract(evmNetwork.userWallets[0], Executable, [
    evmNetwork.gateway.address,
    evmNetwork.gasService.address,
]);
```

## Step 5: Deploy a Module on the Sui Network

Specify the path to your folder containing the `Move.toml` file and deploy a module on the Sui network.

```ts
const pathToModule = '..'; // Specify the path to your move folder containing the `Move.toml` file.
const response = await suiClient.deploy(path.join(__dirname, pathToModule));

// Tip: You can extract the transaction digest from the `response` to view deployment details at: https://suiexplorer.com/?network=local
```

## Step 6: Execute a Function on the EVM Contract

Using the [TestExecutable](../contracts/TestExecutable.sol) contract as a reference, execute a function to set a message on the EVM contract and add a sibling.

## Step 7: Relay the Transaction to the Sui Network

To finalize, relay the transaction from the EVM network to the Sui network.

```ts
await evmRelayer.relay();
```

This completes your guide on relaying transactions from EVM to Sui. Ensure to test your setup adequately to confirm successful configuration and relay transactions.
