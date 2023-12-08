# Axelar Local Dev Cosmos

> Note: This package is under development and may have unstable functionalities.

## Prerequisite

- Docker running on your local machine.

## Quick Start

### Start Wasm and Axelar Chain

Run the following command to pull the Docker image, set up the chains, and establish IBC connections:

```bash
npm run start
```

or just call the start function like the following:

```ts
import { startAll } from "@axelar-network/axelar-local-dev-cosmos";

startAll();
```

## Run IBC Relayer and Axelar Event Listener

Now, you have to run the Axelar Listener to keep listening to incoming IBC events from IBC Relayer which relays message from Wasm chain to Axelar chain.

1. **Run IBC Relayer** to relay messages periodically:

```ts
const {
  IBCRelayerService,
} = require("@axelar-network/axelar-local-dev-cosmos");

const ibcRelayer = await IBCRelayerService.create();
await ibcRelayer.setup();
await ibcRelayer.runInterval();
```

2. **Run Axelar Relayer Service** to keep listening to incoming events:

```ts
import {
  defaultAxelarChainInfo,
  AxelarRelayerService,
} from "@axelar-network/axelar-local-dev-cosmos";

const axelarRelayerService = await AxelarRelayerService.create(
  defaultAxelarChainInfo
);

await axelarRelayerService.listenForEvents();
```

### Relaying Messages

After submitting a message from `Ethereum` or `Wasm` chain, use the relay function:

```ts
import { evmRelayer } from "@axelar-network/axelar-local-dev";
import {
  defaultAxelarChainInfo,
  AxelarRelayerService,
} from "@axelar-network/axelar-local-dev-cosmos";

// Setup for Ethereum Network and Wasm chain relayer
const evmNetwork = await createNetwork({ name: "Ethereum" });
const wasmRelayer = await AxelarRelayerService.create(defaultAxelarChainInfo);

// Deploy contracts, send message, and call relay function
// ...

// evmRelayer is initialized prior to export.
await relay({
  wasm: wasmRelayer,
  evm: evmRelayer,
});

// Verify results on the destination chain
// ...
```

### Examples

- Currently, we support Ethereum as the destination chain for messages from the Wasm chain.
- See our [Local E2E Test](src/__tests__/e2e/relayer.e2e.ts) and [Axelar Example](https://github.com/axelarnetwork/axelar-examples/tree/feat/add-cosmos-examples/examples/cosmos/call-contract) for implementation details.

> The Local E2E test utilizes the same contracts as in the Axelar Examples.
