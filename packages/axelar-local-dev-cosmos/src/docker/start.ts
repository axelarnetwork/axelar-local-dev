import { v2 as compose } from "docker-compose";
import { defaultConfig as axelarConfig } from "../axelar";
import { defaultConfig as wasmConfig } from "../wasm";
import { CosmosChainInfo, ChainConfig, CosmosChain } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";
import {
  createContainerEnv,
  getChainConfig,
  getOwnerAccount,
  isDockerRunning,
  waitForRpc,
} from "./utils";

export async function startAll(
  customAxelarConfig?: ChainConfig,
  customWasmConfig?: ChainConfig
) {
  return Promise.all([
    start("axelar", customAxelarConfig || axelarConfig),
    start("wasm", customWasmConfig || wasmConfig),
  ]);
}

export async function start(
  chain: CosmosChain,
  options: ChainConfig = getChainConfig(chain)
): Promise<CosmosChainInfo> {
  const { dockerPath, lcdPort, rpcPort } = options;

  const env = createContainerEnv(chain, options);

  // Check if docker is running
  if (!(await isDockerRunning(dockerPath))) {
    throw new Error(
      "Docker is not running. Please start Docker and try again."
    );
  }

  // Setup docker-compose config
  const config = {
    cleanStart: true,
    cwd: dockerPath,
    env,
  };

  logger.log(`Starting ${chain} container...`);

  // Start docker container
  await compose.upOne(chain, config);

  // Wait for cosmos to start
  await waitForRpc(chain, options);

  logger.log(`${chain} started`);
  return {
    owner: await getOwnerAccount(chain, dockerPath),
    denom: env.DENOM,
    lcdUrl: `http://localhost:${lcdPort}`,
    rpcUrl: `http://localhost:${rpcPort}`,
  };
}
