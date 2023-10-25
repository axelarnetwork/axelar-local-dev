import { IDockerComposeOptions, v2 as compose } from "docker-compose";
import { defaultConfig as axelarConfig } from "../axelar";
import { defaultConfig as wasmConfig } from "../wasm";
import { CosmosChainInfo, ChainConfig, CosmosChain } from "../types";
import {
  createContainerEnv,
  getChainConfig,
  getChainDenom,
  getOwnerAccount,
  isDockerRunning,
  waitForRpc,
} from "./utils";

export async function startAll(
  customAxelarConfig?: ChainConfig,
  customWasmConfig?: ChainConfig
) {
  const configAxelar = customAxelarConfig || axelarConfig;
  const configWasm = customWasmConfig || wasmConfig;

  return Promise.all([
    start("axelar", configAxelar),
    start("wasm", configWasm),
  ]);
}

export async function start(
  chain: CosmosChain,
  options: ChainConfig = getChainConfig(chain)
): Promise<CosmosChainInfo> {
  const { dockerPath, lcdPort, rpcPort } = options;

  // Create .env file for docker-compose
  createContainerEnv(chain, options);

  // Check if docker is running
  await throwIfDockerNotRunning(dockerPath);

  // Setup docker-compose config
  const config: IDockerComposeOptions = {
    cwd: dockerPath,
  };

  console.log(`Starting ${chain} container...`);

  // Start docker container
  await compose.upOne(chain, config);

  // Wait for cosmos to start
  await waitForRpc(chain, options);

  console.log(`${chain} started at http://localhost:${rpcPort}`);
  return {
    owner: await getOwnerAccount(chain, dockerPath),
    // denom: env.DENOM,
    denom: getChainDenom(chain),
    lcdUrl: `http://localhost:${lcdPort}`,
    rpcUrl: `http://localhost:${rpcPort}`,
  };
}

async function throwIfDockerNotRunning(dockerPath: string) {
  if (!(await isDockerRunning(dockerPath))) {
    throw new Error(
      "Docker is not running. Please start Docker and try again."
    );
  }
}
