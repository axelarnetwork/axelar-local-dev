import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { ps } from "docker-compose";
import { defaultConfig as axelarConfig } from "../axelar";
import { defaultConfig as wasmConfig } from "../wasm";
import { ChainConfig, CosmosChain } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

export function getChainDenom(chain: CosmosChain) {
  return chain === "axelar" ? "uaxl" : "uwasm";
}

export function getChainPrefix(chain: CosmosChain) {
  return chain === "axelar" ? "axelar" : "wasm";
}

export function getChainConfig(chain: CosmosChain) {
  return chain === "axelar" ? axelarConfig : wasmConfig;
}

export function createContainerEnv(chain: CosmosChain, options: ChainConfig) {
  const { dockerPath, rpcPort, lcdPort } = options;
  const envPath = path.join(dockerPath, ".env");
  const env = `CHAIN_ID=${chain}\nCHAIN_LCD_PORT=${lcdPort}\nCHAIN_RPC_PORT=${rpcPort}\nMONIKER=${chain}`;
  fs.writeFileSync(envPath, env);
}

export async function getOwnerAccount(chain: CosmosChain, dockerPath: string) {
  // Get mnemonic and address from the container
  const homedir = `./.${chain}`;
  const homePath = path.join(dockerPath, homedir);
  const mnemonic = fs.readFileSync(`${homePath}/mnemonic.txt`, "utf8");
  const address = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: getChainPrefix(chain),
  })
    .then((wallet) => wallet.getAccounts())
    .then((accounts) => accounts[0].address);

  return {
    mnemonic,
    address,
  };
}

/**
 * Periodically fetching the healthcheck url until the response code is 200.
 * If response isn't 200 within {timeout}, throws an error.
 */
export async function waitForRpc(chain: CosmosChain, config: ChainConfig) {
  const { healthcheckEndpoint, rpcPort } = config;
  const start = Date.now();
  const timeout = 60000;
  const interval = 3000;
  const url = `http://localhost:${rpcPort}/${healthcheckEndpoint}`;
  logger.log(`Waiting for ${chain} to start at ${url}...`);
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
    throw new Error(`${chain} failed to start in ${timeout}ms`);
  }
}

/**
 * Checking if the docker service is running on the host machine
 * @returns true if the docker service is running, otherwise false.
 */
export async function isDockerRunning(dockerPath: string) {
  return ps({
    cwd: dockerPath,
  })
    .then(() => true)
    .catch((e) => logger.log(e));
}
