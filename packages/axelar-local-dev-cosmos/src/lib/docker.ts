import path from "path";
import fetch from "node-fetch";
import { v2 as compose, ps } from "docker-compose";

export interface StartOptions {
  cleanStart?: boolean;
  chain?: CosmosChainOptions;
}

export interface CosmosChainOptions {
  name: string;
  port: number;
}

const defaultStartOptions = {
  cleanStart: true,
  chain: {
    name: "demo-cosmos-1",
    port: 1317,
  },
};

export const cosmosAppName = "demo-chain";

export async function start(options?: StartOptions) {
  // if (!(await isDockerRunning())) {
    // console.error("Docker is not running. Please start Docker and try again.");
    // return;
  // }

  const { cleanStart, chain } = { ...defaultStartOptions, ...options };

  if (cleanStart) {
    await stop();
  }

  await compose.upOne(cosmosAppName, {
    cwd: path.join(__dirname, "../docker"),
    env: {
      ...process.env,
      CHAIN_NAME: chain.name,
      CHAIN_PORT: chain.port.toString(),
    },
    log: true,
  });

  console.log("Waiting for Cosmos to start (~5-10s)...");
  await waitForCosmos();

  console.log("Cosmos started");
}

async function waitForCosmos() {
  const start = Date.now();
  const timeout = 60000;
  const interval = 3000;
  const url = "http://localhost:1317/cosmos/base/node/v1beta1/status";
  let status = 0;
  while (Date.now() - start < timeout) {
    try {
      status = await fetch(url).then((res: any) => res.status);
      if (status === 200) {
        break;
      }
    } catch (e) {
      // do nothing
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (status !== 200) {
    throw new Error(`Cosmos failed to start in ${timeout}ms`);
  }
}

export async function isDockerRunning() {
  return ps({ cwd: "../docker" })
    .then(() => true)
    .catch((e) => console.log(e));
}

export async function stop() {
  console.log("Stopping Cosmos...");
  try {
    await compose.down({
      cwd: path.join(__dirname, "../docker"),
    });
  } catch (e: any) {
    console.log(e);
  }
  console.log("Cosmos stopped");
}
