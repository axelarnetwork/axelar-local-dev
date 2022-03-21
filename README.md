# Axelar Local Gateway

This environment allows you to setup a local instance of the Axelar Gateways, instantiate your application-level executor contracts on the source/destination chains, and simulate message relaying between them.

## Installation and simple use.

To install on simply run:

```
npm install https://github.com/axelarnetwork/axelar-local-gateway
```

The following script shows a simple example of how to use this module to create two test blockchains and send some UST from one to the other.

```
const  axelar = require('axelar-local-gateway');

(async () => {
	const  chain1 = await  axelar.createNetwork();
	const [user1] = chain1.userWallets;
	const  chain2 = await  axelar.createNetwork();
	const [user2] = chain2.userWallets;

	await  chain1.giveToken(user1.address, 'UST', 1000);

	console.log(`user1 has ${await  chain1.ust.balanceOf(user1.address)} UST.`);
	console.log(`user2 has ${await  chain2.ust.balanceOf(user2.address)} UST.`);

	//Approve the AxelarGateway to use our UST on chain1.
	await (await  chain1.ust.connect(user1).approve(chain1.gateway.address, 100)).wait();
	//And have it send it to chain2.
	await (await  chain1.gateway.connect(user1).sendToken(chain2.name, user2.address, 'UST', 100)).wait();
	//Have axelar relay the tranfer to chain2.
	await  axelar.relay();

	console.log(`user1 has ${await  chain1.ust.balanceOf(user1.address)} UST.`);
	console.log(`user2 has ${await  chain2.ust.balanceOf(user2.address)} UST.`);
})();
```

Additional examples are present in the `examples` directory and can be run with:

```
node node_modules/axelar-local-gateway/examples/<example_dir>/<file_name>.js
```

## Functionality

This module exports the following functionality:
- `Network`: This object type is used to handle most functionality within the module. It has the following properties:
	- `name`: The name of the network.
	- `chainId`: The chainId of the network.
	- `provider`: The `ethers.Provider` for the network.
	- `userWallets`: A list of funded `ethers.Wallet` objects.
	- `gateway`: An `ethets.Contract` object corresponding to the Axelar Gateway on the network.
	- `ust`: An `ethets.Contract` object corresponding to the IERC20 of the Axelar Wrapped UST on this network.
	- `ownerWallet`, `operatorWallet`, `relayerWallet`, `adminWallets` `threshold` `lastRelayedBlock`: These are for configuring the gateway and relaying.
	- `deployToken(name, symbol, decimals, cap)`: Deploys a new token on the network. For a token to be supported properly it needs to be deployed on all created networks.
	- `giveToken(address, symbol, amount)`: Gives `amount` of `symbol` token to `address`.
	- `getInfo()`: Returns an object with all the information about the `Network`. 
	- `relay()`: This method is either equivalent to calling the local instance of this module's `relay()` (see below) or, for remote networks, the host's instance of `relay()`.
- `createNetwork(options)`: Creates a new `Network`. All `options` are optional here but the following can be used:
  - `name`: The name to give the `Network`. Defaults to ``    `Chain ${n}`    ``
  - `chainId`: The chainId of the created network. Defaults to `n`.
  - `seed`: A string used to create the prefunded accounts. Different seeds will result in different contract addresses as well.
  - `port`: If specified the created blockchain will be served on `port`. Additionally, accessing `/axelar` will result in the same output as `Network.getInfo()` and accessing `/relay` will cause the networks present in the instance serving this blockchain to `relay()`.
- `getNetwork(url, info=null)`: Return `Network` hosted elsewhere into this instance. `info` if specified is expected to have the same format as `Network.getInfo()`. 
- `setupNetwork(urlOrProvider, options)`: Deploy the gateway and UST Token on a remote blockchain and return the corresponding `Network`. The only value that is required in `options` is `ownerKey` which is a secret key of a funded account. Available options are:
  -`ownerKey`: This is required and needs to be a funded secret key.
  - `name`: The name of the network. Defaults to ``    `Chain ${n}`   `` 
  - `chainId`: The chainId of the created network. Defaults to `n`.
  - `userKeys`: An array of funded secretKeys to create `Network.userWallets` with. Defaults to `[]`.
  - `operatorKey`, `relayerKey`: They both default to `ownerKey`.
  - `adminKeys`: Defaults to `[ownerKey]`.
  - `threshold`: The number of required admins to perform administrative tasks on the gateway. Defaults to `1`. 
- `networks`: A list of all the `Network`s in this instance.
- `relay()`: A function that passes all the messages to all the gateways and calls the appropriate `IAxelarExecutable` contracts.
