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
  waitForLcd,
  waitForRpc,
} from "./utils";
import path from "path";

export async function startAll(
  customAxelarConfig?: ChainConfig,
  customWasmConfig?: ChainConfig
) {
  const configAxelar = customAxelarConfig || axelarConfig;
  const configWasm = customWasmConfig || wasmConfig;

  return Promise.all([
    start("axelar", configAxelar),
    start("wasm", configWasm),
    startTraefik(),
  ]);
}

export async function startTraefik() {
  const traefikPath = path.join(__dirname, "../../docker/traefik");
  const config: IDockerComposeOptions = {
    cwd: traefikPath,
  };

  console.log("Starting traefik container...");

  await compose.upOne("traefik", config);

  console.log("Traefik started at http://localhost:8080");
}

export async function start(
  chain: CosmosChain,
  options: ChainConfig = getChainConfig(chain)
): Promise<CosmosChainInfo> {
  const { dockerPath } = options;

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

  // Wait for API servers to start
  await waitForRpc(chain);
  await waitForLcd(chain);

  const rpcUrl = `http://localhost/${chain}-rpc`;
  const lcdUrl = `http://localhost/${chain}-lcd`;

  console.log(`RPC server for ${chain} is started at ${rpcUrl}`);
  console.log(`LCD server for ${chain} is started at ${lcdUrl}`);

  return {
    prefix: chain,
    owner: await getOwnerAccount(chain),
    denom: getChainDenom(chain),
    lcdUrl,
    rpcUrl,
  };
}

async function throwIfDockerNotRunning(dockerPath: string) {
  if (!(await isDockerRunning(dockerPath))) {
    throw new Error(
      "Docker is not running. Please start Docker and try again."
    );
  }
}
