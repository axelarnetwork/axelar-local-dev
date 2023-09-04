## Relay from Evm to Sui

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

// ### Execute a function on Evm contract
// We use the [TestExecutable contract](../contracts/TestExecutable.sol) as a reference here.
await evmContract.addSibling('sui', `${response.packages[0].packageId}::hello_world`);
await evmContract.set('sui', 'hello from evm', {
    value: 10000000, // hardcoded relayer fee, we don't check for the fee right now, so you can specify any fee
});

// Relay the transaction to Sui
await evmRekayer.relay();
```
