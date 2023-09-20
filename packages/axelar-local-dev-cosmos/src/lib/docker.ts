import path from "path";
import fetch from "node-fetch";
import { v2 as compose, ps } from "docker-compose";
import { CosmosChainOptions, StartOptions } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";

// A default app name
export const cosmosAppName = "demo-chain";

// A default port
export const defaultPort = 1317;

// API endpoint for healthchecking if the cosmos chain is up and running
const healthcheckApiPath = "cosmos/base/node/v1beta1/status";

// A local path to a folder container docker-compose.yaml file
const dockerPath = path.join(__dirname, "../../docker");

// A default path for running docker compose up
const defaultDockerConfig = {
  cwd: dockerPath,
};

const defaultStartOptions = {
  cleanStart: true,
  chain: {
    name: cosmosAppName,
    port: defaultPort,
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

  const config = {
    ...defaultDockerConfig,
    env: {
      ...process.env,
      CHAIN_NAME: chain.name,
      CHAIN_PORT: chain.port.toString(),
    },
  };

  await compose.upOne(cosmosAppName, config);

  logger.log("Waiting for Cosmos to start (~5-10s)...");
  await waitForCosmos(chain);

  logger.log("Cosmos started");
}

/**
 * Periodically fetching the healthcheck url until the response code is 200.
 * If response isn't 200 within {timeout}, throws an error.
 */
async function waitForCosmos(chain: CosmosChainOptions) {
  const start = Date.now();
  const timeout = 60000;
  const interval = 3000;
  const url = `http://localhost:${chain.port}/${healthcheckApiPath}`;
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
  return ps(defaultDockerConfig)
    .then(() => true)
    .catch((e) => logger.log(e));
}

/**
 * Stop docker container
 */
export async function stop() {
  logger.log("Stopping Cosmos...");
  try {
    await compose.down(defaultDockerConfig);
  } catch (e: any) {
    logger.log(e);
  }
  logger.log("Cosmos stopped");
}
