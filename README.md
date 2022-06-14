# Axelar Local Development Environment

This environment allows you to set up a local instances of the Axelar Gateways, instantiate your application-level executor contracts on the source/destination chains, and simulate message relaying between them.

## Install

```
npm install axelarnetwork/axelar-local-dev
```

## Examples

See [axelar-local-gmp-examples repo](https://github.com/axelarnetwork/axelar-local-gmp-examples/) for example use of this local development environment.

## Simple use

The following script shows a simple example of how to use this module to create two test blockchains and send some UST from one to the other.

```
// axelarTest.js
const axelar = require('@axelar-network/axelar-local-dev');

(async () => {
	const chain1 = await  axelar.createNetwork();
	const [ user1 ] = chain1.userWallets;
	const chain2 = await  axelar.createNetwork();
	const [ user2 ] = chain2.userWallets;

	await chain1.giveToken(user1.address, 'aUSDC', 1000e6);

	console.log(`user1 has ${await  chain1.usdc.balanceOf(user1.address)/1e6} aUSDC.`);
	console.log(`user2 has ${await  chain2.usdc.balanceOf(user2.address)/1e6} aUSDC.`);

	// Approve the AxelarGateway to use our aUSDC on chain1.
	await (await chain1.usdc.connect(user1).approve(chain1.gateway.address, 100e6)).wait();
	// And have it send it to chain2.
	await (await chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'aUSDC', 100e6)).wait();
	// Have axelar relay the tranfer to chain2.
	await  axelar.relay();

	console.log(`user1 has ${await chain1.usdc.balanceOf(user1.address)/1e6} aUSDC.`);
	console.log(`user2 has ${await chain2.usdc.balanceOf(user2.address)/1e6} aUSDC.`);
})();
```

Simply run `node <path to the above script>` to test it. Additional examples are present in the `examples` directory and can be run with:

```
node node_modules/@axelar-network/axelar-local-dev/examples/<example_dir>/<file_name>.js
```

## Functionality

This module exports the following functionality:

- `Network`: This object type is used to handle most functionality within the module. It has the following properties:
  - `name`: The name of the network.
  - `chainId`: The chainId of the network.
  - `provider`: The `ethers.Provider` for the network.
  - `userWallets`: A list of funded `ethers.Wallet` objects.
  - `gateway`: An `ethets.Contract` object corresponding to the Axelar Gateway on the network.
  - `gasReceiver`: An `ethets.Contract` object corresponding to the AxelarGasReceiver that receives gas for remote execution. It expects gas between the same two `relay()`s to funtion properly.
  - `ust`: An `ethets.Contract` object corresponding to the IERC20 of the Axelar Wrapped UST on this network.
  - `ownerWallet`, `operatorWallet`, `relayerWallet`, `adminWallets` `threshold` `lastRelayedBlock`: These are for configuring the gateway and relaying.
  - `deployToken(name, symbol, decimals, cap)`: Deploys a new token on the network. For a token to be supported properly it needs to be deployed on all created networks.
  - `getTokenContract(sybmol)`: Returns an `ethers.Contract` linked to the ERC20 token represented by `symbol`.
  - `giveToken(address, symbol, amount)`: Gives `amount` of `symbol` token to `address`.
  - `getInfo()`: Returns an object with all the information about the `Network`.
  - `relay()`: This method is either equivalent to calling the local instance of this module's `relay()` (see below) or, for remote networks, the host's instance of `relay()`.
- `createNetwork(options)`: Creates a new `Network`. All `options` are optional here but the following can be used:
  - `name`: The name to give the `Network`. Defaults to `` `Chain ${n}` ``
  - `chainId`: The chainId of the created network. Defaults to `n`.
  - `seed`: A string used to create the prefunded accounts. Different seeds will result in different contract addresses as well.
  - `port`: If specified the created blockchain will be served on `port`. Additionally, accessing `/axelar` will result in the same output as `Network.getInfo()` and accessing `/relay` will cause the networks present in the instance serving this blockchain to `relay()`.
  - `dbPath`: A path to a folder to save this network. If specified and the network has been saved all other options are ignored and the network is loaded from the database.
- `getNetwork(urlOrProvider, info=null)`: Return `Network` hosted elsewhere into this instance. `info` if specified is expected to have the same format as `Network.getInfo()`.
- `setupNetwork(urlOrProvider, options)`: Deploy the gateway and UST Token on a remote blockchain and return the corresponding `Network`. The only value that is required in `options` is `ownerKey` which is a secret key of a funded account. Available options are:
  - `ownerKey`: This is required and needs to be a funded secret key.
  - `name`: The name of the network. Defaults to `` `Chain ${n}` ``
  - `chainId`: The chainId of the created network. Defaults to `n`.
  - `userKeys`: An array of funded secretKeys to create `Network.userWallets` with. Defaults to `[]`.
  - `operatorKey`, `relayerKey`: They both default to `ownerKey`.
  - `adminKeys`: Defaults to `[ownerKey]`.
  - `threshold`: The number of required admins to perform administrative tasks on the gateway. Defaults to `1`.
- `listen(port, callback = null)`: This will serve all the created networks on port `port`. Each network is served at `/i` where `i` is the index of the network in `networks` (the first network created is at `/0` and so on).
- `getAllNetworks(url)`: This will retreive all the networks served by `listen` called from a different instance.
- `relay()`: A function that passes all the messages to all the gateways and calls the appropriate `IAxelarExecutable` contracts.
- `getDepostiAddress(sourceNetwork, destinationNetwork, destinationAddress, symbol)`: This function generates a deposit address on `network1` that will route any funds of type `symbol` deposited there (minus some fee) to the `destinationAddress` in `network2`.
- `getFee(sourceNetwork, destinationNetwork, symbol)`: returns the fee for transferring funds. Is set to a constant `1,000,000`.
- `getGasPrice(sourceNetwork, destinationNetwork, tokenOnSource)`: returns the gas price to execute on `destinationChain`, to be payed in `sourceChain` in token specified by `tokenOnSource` (which is given as an address). `tokenOnSource=AddressZero` corresponds to the native token of the source chain. It always returns `1` but may change in the future.
- `stop(network)`: Destroys the network and removes it from the list of tracked networks.
- `stopAll()`: Stops all tracked networks.
- `networks`: A list of all the `Network`s in this instance.

## Smart Contracts

To use the Networks created you need to interact with the deployed `AxelarGateway` contract. You can send remote contract calls to the contracts implementing the `IAxelarExecutable` interface.

### `AxelarGateway`

This contract exposes three functions to use:

- `sendToken(string destinationChain, string destinationAddress, string symbol, uint256 amount)`: The `destinationChain` has to match the network name for the token to reach its destination after relaying. The `destinationAddress` is the human-readable version of the address, prefixed with `0x`. This is a `string` instead of an `address` because in the real world you can send token to non-evm chains that have other address formats as well. `tokenSymbol` has to match one of the tokens that are deployed in the network, by default just UST but additional tokens can be added (see `deployToken` under `Network`).
- `callContract(string destinationChain, string contractDestinationAddress, bytes payload)`: See above for `destinationChain` and `contractDestinationAddress`. `payload` is the information passed to the contract on the destination chain. Use `abi.encode` to produce `payload`s.
- `callContractWithToken(string destinationChain, string contractDestinationAddress, bytes payload, string symbol, uint256 amount)`: This is a combination of the above two functions, but the token has to arrive at the contract that is executing.

### `IAxelarExecutable`

This interface is to be implemented for a contract to be able to receive remote contract calls. There are two functions that can be overriden, but depending on the use you may only choose to override one of them only.

- `_execute(string memory sourceChain, string memory sourceAddress, bytes calldata payload)`: This will automatically be called when Axelar relays all messages. `sourceChain` and `sourceAddress` can be used to validate who is making the contract call, and `payload` can be decoded with `abi.decode` to produce any data needed.
- `_executeWithToken(string memory sourceChain, string memory sourceAddress, bytes calldata payload, string memory symbol, uinst256 amount)`: This is the same as above but it is guaranteed to have also received `amount` token specified by `symbol`. You can use \_getTokenAddress(symbol) to obtain the address of the ERC20 token received.

### `AxelarGasReceiver`

This contract is automatically deployed and can be used to pay gas for the destination contract execution on the source chain. Smart contracts calling `callContract` and `callContractWithToken` should also handle paying for gas. It exposes [many functions](https://github.com/axelarnetwork/axelar-cgp-solidity/blob/feat/gas-receiver/src/util/AxelarGasReceiver.sol), but the main ones are

- `receiveGas(string destinationChain, string destinationAddress, bytes payload, address gasToken, uint256 gasAmount)`: Receives `gasAmount` of `gasToken` to execute the contract call specified. The execution will use a gasLimit of `gasAmount / getGasPrice(...)` (see [above](#functionality) for `getGasPrice`).
- `receiveGasNative(string destinationChain, string destinationAddress, bytes payload)`: As above with the native token as the `gasToken` and `msg.value` as the `gasAmount`.
- `receiveGasWithToken(string destinationChain, string destinationAddress, bytes payload, string symbol, uint256 amountThrough, address gasToken, uint256 gasAmount)`, `receiveGasNtiveWithToken(string destinationChain, string destinationAddress, bytes payload, string symbol, uint256 amountThrough)`: Similar to the above functions but they are for `callContractWithToken` instead of `callContract`.
- `ReceiveGas(Native)AndCallRemote(WithToken)(...)`: There are four such functions that will also pass the call to the gateway after receiving gas, for convenience.
