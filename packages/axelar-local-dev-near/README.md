## Axelar Local Development Near

## Install

```
npm install @axelar-network/axelar-local-dev-near
```

## Description

We support a local development enviroment for near cross chain communication. Currently we only support general message passing using NEAR and EVM (Aptos support is not implemented).

NEAR local development enviroment is based on [near-workspaces-js](https://github.com/near/workspaces-js) and `NearNetwork` is an extension of `Worker` (available in [near-workspaces-js](https://github.com/near/workspaces-js) package). `NearNetwork` includes everything that `Worker` has and some additional funcionalities:

-   `createAccountAndDeployContract(accountId: string, contractWasmPath: string, nearAmount = 200)`: Allows user to quickly create a new NEAR account with a specified amount of NEAR (default - 200 NEAR) and deploy contract to it.

-   `callContract(account: NearAccount, contract: NearAccount, method: string, args: any, amount = 0)`: This method needs to be used to do any contract calls, it takes the account that will call the contract, contract that we want to call, method that we want to call, args and amount of NEAR that we wish to attach to the call.

-   `stopNetwork()`: Needs to be called at the end of the script, so it stops the `near-sandbox` process which is a local mini-NEAR blockchain.

Additionaly we export a utility function:

-   `createNearNetwork(config?: Config)`: Creates an instance of `NearNetwork` and starts the `near-sandbox` process. It can take a `Config` object as described in [near-workspaces-js](https://github.com/near/workspaces-js).
