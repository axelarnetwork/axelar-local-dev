import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { ps } from "docker-compose";
import { defaultAxelarConfig, defaultWasmConfig } from "../config";
import { ChainConfig, CosmosChain } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import bech32 from "bech32";
import { readFileSync } from "../utils";
import { Path } from "../path";

export function getChainDenom(chain: CosmosChain) {
  return chain === "axelar" ? "uaxl" : "uwasm";
}

export function getChainPrefix(chain: CosmosChain) {
  return chain === "axelar" ? "axelar" : "wasm";
}

export function getChainConfig(chain: CosmosChain) {
  return chain === "axelar" ? defaultAxelarConfig : defaultWasmConfig;
}

export function convertCosmosAddress(address: string, prefix: string) {
  const decoded = bech32.decode(address);
  return bech32.encode(prefix, decoded.words);
}

// export function createContainerEnv(chain: CosmosChain, options: ChainConfig) {
//   const { dockerPath } = options;
//   const envPath = path.join(dockerPath, ".env");
//   const env = `CHAIN_ID=${chain}\nMONIKER=${chain}`;
//   fs.writeFileSync(envPath, env);
// }

export async function getOwnerAccount(chain: CosmosChain) {
  // Get mnemonic and address from the container
  const homePath = path.join(Path.docker(chain), `.${chain}`);
  const mnemonic = readFileSync(`${homePath}/mnemonic.txt`, "utf8");
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
export async function waitForRpc(chain: CosmosChain, timeout = 120000) {
  const start = Date.now();
  const interval = 3000;
  const url = `http://localhost/${chain}-rpc/health`;
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
    throw new Error(`${chain} rpc server failed to start in ${timeout}ms`);
  }
}

export async function waitForLcd(chain: CosmosChain, timeout = 60000) {
  const testUrl = "cosmos/base/tendermint/v1beta1/node_info";
  const start = Date.now();
  const interval = 3000;
  const url = `http://localhost/${chain}-lcd/${testUrl}`;
  let result, network;
  while (Date.now() - start < timeout) {
    try {
      result = await fetch(url).then((res: any) => res.json());
      network = result.default_node_info.network;
      if (network === chain) {
        break;
      }
    } catch (e) {
      // do nothing
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (network !== chain) {
    throw new Error(`${chain} lcd server failed to start in ${timeout}ms`);
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
