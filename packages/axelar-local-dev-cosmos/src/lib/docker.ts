import path from "path";
import fetch from "node-fetch";
import { v2 as compose, ps } from "docker-compose";
import { CosmosChainOptions, StartOptions, CosmosChainInfo } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import fs from "fs";

// A default app name
export const cosmosAppName = "demo-chain";

// A default port
export const defaultLcdPort = 1317;
export const defaultRpcPort = 26657;

// API endpoint for healthchecking if the cosmos chain is up and running
const healthcheckApiPath = "cosmos/base/tendermint/v1beta1/node_info";

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
    port: defaultLcdPort,
    rpcPort: defaultRpcPort,
  },
};

// Start cosmos container
export async function start(options?: StartOptions): Promise<CosmosChainInfo> {
  const { cleanStart, chain, dockerComposeOptions } = {
    ...defaultStartOptions,
    ...options,
  };

  // Write given env vars to .env file
  const envPath = path.join(dockerPath, ".env");
  const env = `CHAIN_NAME=${chain.name}\nCHAIN_PORT=${chain.port}\nCHAIN_RPC_PORT=${chain.rpcPort}`;
  fs.writeFileSync(envPath, env);

  // Check if docker is running
  if (!(await isDockerRunning())) {
    throw new Error(
      "Docker is not running. Please start Docker and try again."
    );
  }

  if (cleanStart) {
    await stop();
  }

  // Setup docker-compose config
  const config = {
    ...defaultDockerConfig,
    ...dockerComposeOptions,
  };

  // Start docker container
  await compose.upOne(cosmosAppName, config);

  // Wait for cosmos to start
  logger.log("Waiting for Cosmos to start (~5-10s)...");
  await waitForCosmos(chain);

  logger.log("Cosmos started");

  // Get mnemonic and address from the container
  const homedir = `./private/.${chain.name}`;
  const homePath = path.join(dockerPath, homedir);
  const mnemonic = fs.readFileSync(`${homePath}/mnemonic.txt`, "utf8");
  const address = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic)
    .then((wallet) => wallet.getAccounts())
    .then((accounts) => accounts[0].address);

  return {
    owner: {
      mnemonic,
      address,
    },
    lcdUrl: `http://localhost:${chain.port}`,
    rpcUrl: `http://localhost:${chain.rpcPort}`,
  };
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
  logger.log(`Waiting for Cosmos to start at ${url}...`);
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
