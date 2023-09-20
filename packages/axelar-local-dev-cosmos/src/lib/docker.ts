import path from "path";
import fetch from "node-fetch";
import { v2 as compose, ps } from "docker-compose";
import { CosmosChainOptions, StartOptions } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";

export const cosmosAppName = "demo-chain";
const healthcheckUrl = "http://localhost:1317/cosmos/base/node/v1beta1/status";
const dockerPath = path.join(__dirname, "../../docker");
const defaultDockerConfig = {
  cwd: dockerPath,
};
const defaultStartOptions = {
  cleanStart: true,
  chain: {
    name: "demo-cosmos-1",
    port: 1317,
  },
};

// Start cosmos container
export async function start(options?: StartOptions) {
  if (!(await isDockerRunning())) {
    console.error("Docker is not running. Please start Docker and try again.");
    return;
  }

  const { cleanStart, chain } = { ...defaultStartOptions, ...options };

  if (cleanStart) {
    await stop();
  }

  await compose.upOne(cosmosAppName, {
    ...defaultDockerConfig,
    env: {
      ...process.env,
      CHAIN_NAME: chain.name,
      CHAIN_PORT: chain.port.toString(),
    },
  });

  logger.log("Waiting for Cosmos to start (~5-10s)...");
  await waitForCosmos();

  logger.log("Cosmos started");
}

/**
 * Periodically fetching the healthcheck url until the response code is 200.
 * If response isn't 200 within {timeout}, throws an error.
 */
async function waitForCosmos() {
  const start = Date.now();
  const timeout = 60000;
  const interval = 3000;
  const url = healthcheckUrl;
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

/**
 * Checking if the docker service is running on the host machine
 * @returns true if the docker service is running, otherwise false.
 */
export async function isDockerRunning() {
  return ps({ cwd: dockerPath })
    .then(() => true)
    .catch((e) => logger.log(e));
}

/**
 * Stop docker container
 */
export async function stop() {
  logger.log("Stopping Cosmos...");
  try {
    await compose.down({
      cwd: dockerPath,
      log: true,
    });
  } catch (e: any) {
    logger.log(e);
  }
  logger.log("Cosmos stopped");
}
