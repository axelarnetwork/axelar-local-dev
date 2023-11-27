# Relay from Sui to Evm

This guide delineates the procedure to orchestrate a transaction relay from the Sui network to an Evm network. Follow the steps below to initialize relayers, deploy modules and contracts, and execute functions on the Sui module before relaying the transaction to the Evm network.

### Step 1: Import Necessary Modules

Start by importing the necessary modules that provide the functions and objects you'll use throughout the script.

```ts
import { createSuiRelayer, RelayerType, initSui } from '@axelar-network/axelar-local-dev-sui';
import { EvmRelayer, createNetwork, deployContract } from '@axelar-network/axelar-local-dev';
import { ethers } from 'ethers';
import path from 'path';
```

### Step 2: Initialize Sui and EVM Relayers

Next, initialize both the Sui and EVM relayers to facilitate communication between the two networks.

```ts
const { suiRelayer, suiClient } = await initSui();
const evmRelayer = new EvmRelayer();

// Set the Sui relayer as the relay conduit to the EVM network.
evmRelayer.setRelayer(RelayerType.sui, suiRelayer);
```

### Step 3: Set Up an EVM Network

Set up a new EVM network, which we will refer to as "Evm1", where you will deploy your contracts.

```ts
const evmNetwork = await createNetwork({
    name: 'Evm1',
});
```

### Step 4: Deploy a Contract on the EVM Network

Now, deploy a contract on the freshly created EVM network using the appropriate executable file.

```ts
const Executable = require('path/to/contract_json');
const evmContract = await deployContract(evmNetwork.userWallets[0], Executable, [
    evmNetwork.gateway.address,
    evmNetwork.gasService.address,
]);
```

### Step 5: Deploy a Module on the Sui Network

Proceed to deploy a module on the Sui network. Ensure to specify the path to your folder housing the `Move.toml` file.

```ts
const pathToModule = '..';
const response = await suiClient.deploy(path.join(__dirname, pathToModule));

// Hint: You can retrieve the transaction digest from the `response` for deployment details at: https://suiexplorer.com/?network=local
```

### Step 6: Execute a Function on the Sui Module

Using the [hello_world](../move/sample/sources/hello_world.move) module as an example, create a transaction block and execute a function call on the Sui module, incorporating necessary arguments.

```ts
const tx = new TransactionBlock();
const payload = ethers.utils.defaultAbiCoder.encode(['string'], ['hello from sui']);
tx.moveCall({
    target: `${response.packages[0].packageId}::hello_world::call`,
    arguments: [tx.pure(evmNetwork.name), tx.pure(evmContract.address), tx.pure(payload), tx.pure(1)],
});

// Transmit the transaction to the Sui network.
await suiClient.execute(tx);
```

### Step 7: Relay the Transaction to the EVM Network

To wrap up, relay the transaction from the Sui network to the EVM network, effectively completing the relay process.

```ts
await suiRelayer.relay();
```

You have now successfully navigated through the steps necessary for relaying transactions from Sui to EVM. Remember to conduct sufficient tests to verify the successful setup and relay of transactions.

## Full Example

```ts
import { createSuiRelayer, RelayerType, initSui } from '@axelar-network/axelar-local-dev-sui';
import { EvmRelayer, createNetwork, deployContract } from '@axelar-network/axelar-local-dev';
import { ethers } from 'ethers';
import path from 'path';

async function main() {
    // Initialize SuiRelayer and EvmRelayer
    const { suiRelayer, suiClient } = await initSui();
    const evmRelayer = new EvmRelayer();

    // Set SuiRelayer to EvmRelayer to facilitate relaying transactions to the Sui Network
    evmRelayer.setRelayer(RelayerType.sui, suiRelayer);

    // Create an Evm network named "Evm1"
    const evmNetwork = await createNetwork({ name: 'Evm1' });

    // Deploy a contract on Evm1
    const Executable = require('path/to/contract_json');
    const evmContract = await deployContract(evmNetwork.userWallets[0], Executable, [
        evmNetwork.gateway.address,
        evmNetwork.gasService.address,
    ]);

    // Deploy a module on Sui
    const pathToModule = '..';
    const response = await suiClient.deploy(path.join(__dirname, pathToModule));

    // Execute a function on the Sui module
    const tx = new TransactionBlock();
    const payload = ethers.utils.defaultAbiCoder.encode(['string'], ['hello from sui']);
    tx.moveCall({
        target: `${response.packages[0].packageId}::hello_world::call`,
        arguments: [tx.pure(evmNetwork.name), tx.pure(evmContract.address), tx.pure(payload), tx.pure(1)],
    });

    // Send the transaction to the Sui network
    await suiClient.execute(tx);

    // Relay the transaction to the Evm1 chain
    await suiRelayer.relay();

    // Print the message from the contract on Evm1 chain
    console.log('Updated Message:', await evmContract.value());
}

// Execute the main function and catch any errors
main().catch(console.error);
```
