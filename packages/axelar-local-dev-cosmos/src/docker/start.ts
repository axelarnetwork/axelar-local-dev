import { IDockerComposeOptions, v2 as compose } from "docker-compose";
import { defaultAxelarConfig, defaultWasmConfig } from "../config";
import { CosmosChainInfo, ChainConfig, CosmosChain } from "../types";
import {
  getChainConfig,
  getChainDenom,
  getOwnerAccount,
  isDockerRunning,
  waitForLcd,
  waitForRpc,
} from "./utils";
import path from "path";
import { IBCRelayerService } from "../services";
import { retry } from "../utils";
import { Path } from "../path";

export async function startAll(
  customAxelarConfig?: ChainConfig,
  customWasmConfig?: ChainConfig
) {
  const configAxelar = customAxelarConfig || defaultAxelarConfig;
  const configWasm = customWasmConfig || defaultWasmConfig;

  const chains = await Promise.all([
    start("axelar", configAxelar),
    start("wasm", configWasm),
    startTraefik(),
  ]).catch((e) => console.log(e));

  const ibcRelayer = await IBCRelayerService.create();

  // Add retry
  console.log("Setting up IBC relayer");
  retry(async () => {
    await ibcRelayer.setup();
  });
  console.log("IBC relayer setup completed!");

  return chains;
}

export async function startTraefik() {
  const traefikPath = path.join(Path.base, "docker/traefik");
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
  // createContainerEnv(chain, options);

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
  const wsUrl = `ws://localhost/${chain}-rpc/websocket`;

  console.log(`RPC server for ${chain} is started at ${rpcUrl}`);
  console.log(`LCD server for ${chain} is started at ${lcdUrl}`);
  console.log(`WS server for ${chain} is started at ${wsUrl}`);

  const response = {
    prefix: chain,
    owner: await getOwnerAccount(chain),
    denom: getChainDenom(chain),
    lcdUrl,
    rpcUrl,
    wsUrl,
  };

  await options?.onCompleted(response);

  return response;
}

async function throwIfDockerNotRunning(dockerPath: string) {
  if (!(await isDockerRunning(dockerPath))) {
    throw new Error(
      "Docker is not running. Please start Docker and try again."
    );
  }
}
