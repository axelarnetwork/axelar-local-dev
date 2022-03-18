# Axelar Local Gateway
## Installation
To install simply run:
```
git clone https://github.com/axelarnetwork/axelar-local-gateway
cd axelar-local-gateway
npm install
npm run build
```
and to ensure this was install properly run: 
```
npm run test
```
## AxelarLocal.js
This module exports three things:
- `createChain(name?, chainId?)`: Creates a new network and deploys all the contracts necessary for testing with Axelar and returns an object with the following properties:
	- `name`: The name of the network. If unspecified it defaults to `Chain ${n}`.
	- `chainId`: The chainId of the network. if unspecified it defaults to `n`.
	- `provider`: The `ethers.Web3Provider` for the network.
	- `userWallets`: A list of 10 funded `ethers.Wallet` objects.
	- `gateway`: An `ethets.Contract` object corresponding to the Axelar Gateway on the network.
	- `ust`: An `ethets.Contract` object corresponding to the IERC20 of the Axelar Wrapped UST on this network.
	- `ownerWallet`, `operatorWallet`, `relayerWallet`, `adminWallets` `threshold` `lastRelayedBlock`: These are for configuring the gateway and relaying and should not be used.
	- `deployToken(name, symbol, decimals, cap)`: Deploys a new token on the network. For a token to be supported properly it needs to be deployed on all created networks.
	- `giveToken(address, symbol, amount)`: Gives `amount` of `symbol` token to `address`.
- `networks`: A list of all the created networks.
- `relay()`: A function that passes all the messages to all the gateways and calls the appropriate `IAxelarExecutable` contracts.
## Example
A [sample contract](https://github.com/axelarnetwork/axelar-local-gateway/blob/main/contracts/ExecutableSample.sol) is provided. This contract saves a public string called `value` exposes two methods to users:
- `set(string calldata value_)` which updates the contract's `value` and uses Axelar to update all the `values` in contracts deployed in other networks.
- `setAndSend(string calldata value_, string  memory  chain_, address  destination_, string  memory  symbol_)` which works like `set` but will also send some token to a different network where this contract is also deployed.

These can be used as seen [here](https://github.com/axelarnetwork/axelar-local-gateway/blob/main/scripts/sample-script.js). This sample script can be run by using:
```
node scripts/sample-script.js
```
