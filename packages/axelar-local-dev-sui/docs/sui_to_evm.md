## Relay from Sui to Evm

```ts
import { createSuiRelayer, RelayerType } from '@axelar-network/axelar-local-dev-sui';
import { ethers } from 'ethers';

// Initialize SuiRelayer and EvmRelayer
const { suiRelayer, suiClient } = await initSui();
const evmRelayer = new EvmRelayer();

// Set SuiRelayer to EvmRelayer to allow relaying transactions to Sui Network.
evmRelayer.setRelayer(RelayerType.sui, suiRelayer);

// Create Evm network named "Evm1"
const evmNetwork = await createNetwork({
    name: 'Evm1',
});

// Deploy a contract on Evm1
const Executable = require('path/to/contract_json');
const evmContract = await deployContract(evmNetwork.userWallets[0], Executable, [
    evmNetwork.gateway.address,
    evmNetwork.gasService.address,
]);

// Deploy a module on Sui
const pathToModule = '..'; // Specify a path to your move folder containing `Move.toml` file.
const response = await suiClient.deploy(path.join(__dirname, pathToModule));
// Tips: You can print the transaction digest from `response` and see deployment details here: https://suiexplorer.com/?network=local

// ### Execute a function on Sui module.
// We use the [hello_world module](./move/sample/sources/hello_world.move) as a reference here.
const tx = new TransactionBlock();
const payload = ethers.utils.defaultAbiCoder.encode(['string'], ['hello from sui']);
tx.moveCall({
    target: `${response.packages[0].packageId}::hello_world::call`, // Note: use the response object above
    arguments: [tx.pure(evmNetwork.name), tx.pure(evmContract.address), tx.pure(payload), tx.pure(1)],
});
// Send a transaction to Sui network.
await client.execute(tx);

// Relay the transaction to chain Evm1
await suiRelayer.relay();
```
