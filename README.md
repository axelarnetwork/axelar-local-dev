# Agoric <=> EVM

This updates the `axelar-local-dev` repository to use agoric chain instead of wasm chain in `agoric-local-dev-cosmos` package.

This repository does not demonstrate a token trasnfer to eth but rather a message transfer

## Steps to run contract call

- In root of the workspace run:
```bash
    npm install
    npm run build
```
- Change to `axelar-local-dev-cosmos` dir
```bash
    cd packages/axelar-local-dev-cosmos
```
- start the agoric and axelar chains using:
```bash
    npm run start
```
- start the relaying process using
```bash
    npm run relay
```
- you should see this in the logs:
```
Message on Ethereum Contract: [
  'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl',
  'Hello, world!',
  sender: 'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl',
  message: 'Hello, world!'
]
```

## Steps to run contract call with token transfer

- In root of the workspace run:
```bash
    npm install
    npm run build
```
- Change to `axelar-local-dev-cosmos` dir
```bash
    cd packages/axelar-local-dev-cosmos
```
- start the agoric and axelar chains using:
```bash
    npm run start
```
- run the script to start an ibc-transfer
```bash
    bash ./docker/axelar/bin/steps/ibc-transfer.sh
```
- run this script to relay the ibc trasnsaction.
```bash
    npm run relayWithTokens
```
- After that run again to relay the token transfer
```bash
    npm run relayWithTokens
```
- you should see this in the logs:
```
Balance of account after relaying ...
```

> **Note:** the `npm run relay` command will not exit by itself after receiving the message on ethereum and must be manually exited)
## Main file
The main file to look out for is the `packages/axelar-local-dev-cosmos/src/relayToEth.ts` in which the majority of the work is being done.

This file is responsible for 
- starting up an ethereum chain instance
- adding a solidity contract to that instance (which receives the message from cosmos)
- setting up a relayer between axelar and ethereum + axelar and agoric
- sending an IBC transaction from agoric to axelar
- finally, relaying the packets from agoric <=> axelar <=> ethereum
