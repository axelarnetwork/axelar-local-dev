# Axelar Local Dev Cosmos Example

## Introduction

This project demonstrates how to use the Axelar Local Dev Cosmos environment to deploy and interact with contracts across different blockchains. It includes a practical example of running chains, deploying contracts, executing transactions, and relaying these transactions to destination chains.

## Example Project Structure

- **node_modules**: Node.js modules and dependencies for the project.
- **index.js**: Main script demonstrating the use of Axelar Local Dev Cosmos.
- **package.json**: Lists project dependencies and metadata.
- **send_receive.wasm**: WebAssembly binary for the Wasm chain.
- **SendReceive.json**: ABI and bytecode for the Ethereum contract.

Here's example for index.js to demonstrate from running chains, deploy, execute, and relay transactions to the destination chains.

index.js

```js
const {
  createNetwork,
  deployContract,
  evmRelayer,
  relay,
  RelayerType,
} = require("@axelar-network/axelar-local-dev");
const {
  startChains,
  defaultAxelarChainInfo,
  AxelarRelayerService,
} = require("@axelar-network/axelar-local-dev-cosmos");
const SendReceive = require("./SendReceive.json");
const { ethers } = require("ethers");
const path = require("path");

(async () => {
  // Start both Axelar and Wasm Chains
  await startChains();

  // Initialize the Axelar Relayer Service with default configuration
  const axelarRelayer = await AxelarRelayerService.create(defaultChainConfig);
  const ibcRelayer = axelarRelayer.ibcRelayer;
  const wasmClient = ibcRelayer.wasmClient;

  // Setup for Ethereum Network and Wasm chain relayer
  const ethereumNetwork = await createEthereumNetwork({ name: "Ethereum" });

  // Deploy Smart Contract on the EVM (Ethereum Virtual Machine)
  const ethereumContract = await deployEthereumContract(
    ethereumNetwork.userWallets[0],
    SendReceiveContract,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      "Ethereum",
    ],
  );

  // Deploy Contract on the Wasm Chain
  const wasmFilePath = path.resolve("./send_receive.wasm");
  const wasmUploadResponse = await wasmClient.uploadWasm(wasmFilePath);

  // Instantiate the Wasm Contract
  const { client: wasmClient, address: wasmSenderAddress } =
    await wasmClient.createFundedSigningClient();

  const wasmContractInstantiation = await wasmClient.instantiate(
    wasmSenderAddress,
    wasmUploadResponse.codeId,
    {
      channel: ibcRelayer.srcChannelId,
    },
    "send_receive",
    "auto",
  );

  const messageToEthereum = "Hello from Ethereum";
  const messageToWasm = "Hello from Wasm";

  // Send a message from Wasm Chain to Ethereum Chain
  const wasmTransaction = await wasmClient.execute(
    wasmSenderAddress,
    wasmContractInstantiation.contractAddress,
    {
      send_message_evm: {
        destination_chain: "Ethereum",
        destination_address: ethereumContract.address,
        message: messageToWasm,
      },
    },
    "auto",
    "test",
    [{ amount: "100000", denom: "uwasm" }],
  );
  console.log("Wasm Chain Transaction Hash:", wasmTransaction.transactionHash);

  // Send a message from Ethereum Chain to Wasm Chain
  const ethereumTransaction = await ethereumContract.send(
    "wasm",
    wasmContractInstantiation.contractAddress,
    messageToEthereum,
    {
      value: ethers.utils.parseEther("0.001"),
    },
  );
  console.log("Ethereum Chain Transaction Hash:", ethereumTransaction.hash);

  // Set up the Relayer for Wasm Chain
  evmRelayer.setRelayer(RelayerType.Wasm, axelarRelayer);

  // Relay messages between Ethereum and Wasm chains
  await relayMessages({
    wasm: axelarRelayer,
    evm: evmRelayer,
  });

  // Verify the message on the Ethereum contract
  const ethereumMessage = await ethereumContract.storedMessage();
  console.log("Message on Ethereum Contract:", ethereumMessage.message);

  // Verify the message on the Wasm contract
  const wasmResponse = await wasmClient.client.queryContractSmart(
    wasmContractInstantiation.contractAddress,
    {
      get_stored_message: {},
    },
  );

  console.log("Message on Wasm Contract:", wasmResponse.message);
})();
```
