## Prerequisite

- Make sure you have running Docker in your local machine.

## Start Wasm and Axelar Chain

This step will take some time because it need to pull the docker image, setup the chains, and IBC connections.

All you have to do is run the following command:

```bash
npm run start
```

or just call the start function like the following:

```ts
import { startAll } from "@axelar-network/axelar-local-dev-cosmos";

startAll();
```
