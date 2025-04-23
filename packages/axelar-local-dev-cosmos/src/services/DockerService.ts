import path from "path";
import fetch from "node-fetch";
import { execSync } from "child_process";
import { logger } from "@axelar-network/axelar-local-dev";
import { IDockerComposeOptions, v2 as compose, ps } from "docker-compose";
import { CosmosChain, ChainConfig, CosmosChainInfo } from "../types";
import { defaultAxelarConfig, defaultAgoricConfig } from "../config";
import { Path } from "../path";
import { retry, exportOwnerAccountFromContainer } from "../utils";

export class DockerService {
  private axelarConfig: ChainConfig;
  private agoricConfig: ChainConfig;

  constructor(axelarConfig?: ChainConfig, wasmConfig?: ChainConfig) {
    this.axelarConfig = axelarConfig || defaultAxelarConfig;
    this.agoricConfig = wasmConfig || defaultAgoricConfig;
  }

  async startChains() {
    await this.startTraefik();
    const [axelar, agoric] = await Promise.all([
      this.start("axelar", this.axelarConfig),
      this.start("agoric", this.agoricConfig),
    ]);
    return [axelar, agoric];
  }

  async start(
    chain: CosmosChain,
    options: ChainConfig = this.getChainConfig(chain)
  ): Promise<CosmosChainInfo> {
    const { dockerPath } = options;

    await this.throwIfDockerNotFound();
    await this.throwIfDockerNotRunning(dockerPath);

    const config: IDockerComposeOptions = {
      cwd: dockerPath,
    };

    logger.log(`Starting ${chain} container...`);
    await compose.upOne(chain, config);

    await this.waitForRpc(chain, options?.rpcWaitTimeout);
    await this.waitForLcd(chain, options?.lcdWaitTimeout);

    const rpcUrl = `http://localhost/${chain}-rpc`;
    const lcdUrl = `http://localhost/${chain}-lcd`;
    const wsUrl = `ws://localhost/${chain}-rpc/websocket`;

    logger.log(`RPC server for ${chain} is started at ${rpcUrl}`);
    logger.log(`LCD server for ${chain} is started at ${lcdUrl}`);
    logger.log(`WS server for ${chain} is started at ${wsUrl}`);

    const response = {
      prefix: chain,
      owner: await exportOwnerAccountFromContainer(chain),
      denom: this.getChainDenom(chain),
      lcdUrl,
      rpcUrl,
      wsUrl,
    };

    await options?.onCompleted?.(response);

    return response;
  }

  async startTraefik() {
    const traefikPath = path.join(Path.base, "docker/traefik");
    const config: IDockerComposeOptions = {
      cwd: traefikPath,
    };

    logger.log("Starting traefik container...");
    await compose.upOne("traefik", config);
    logger.log("Traefik started at http://localhost:8080");
  }

  async stopAll() {
    await retry(async () => {
      logger.log("Stopping all containers...");
      await this.stop("axelar");
      await this.stop("agoric");
      await this.stopTraefik();
      logger.log("All containers stopped");
    });
  }

  async stop(chain: CosmosChain) {
    logger.log(`Stopping ${chain} container...`);
    try {
      await compose.down({
        cwd: Path.docker(chain),
      });
    } catch (e: any) {
      logger.log(e);
    }
    logger.log(`${chain} stopped`);
  }

  async stopTraefik() {
    const traefikPath = path.join(Path.base, "docker/traefik");
    const config: IDockerComposeOptions = {
      cwd: traefikPath,
    };

    logger.log("Stopping traefik container...");
    await compose.down(config);
    logger.log("Traefik stopped");
  }

  private getChainDenom(chain: CosmosChain): string {
    return chain === "axelar" ? "uaxl" : "ubld";
  }

  private getChainConfig(chain: CosmosChain): ChainConfig {
    return chain === "axelar" ? defaultAxelarConfig : defaultAgoricConfig;
  }

  async waitForRpc(chain: CosmosChain, timeout = 120000): Promise<void> {
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
  async waitForLcd(chain: CosmosChain, timeout = 60000): Promise<void> {
    const testUrl = "cosmos/base/tendermint/v1beta1/node_info";
    const start = Date.now();
    const interval = 3000;
    const url = `http://localhost/${chain}-lcd/${testUrl}`;
    let result, network;
    while (Date.now() - start < timeout) {
      try {
        result = await fetch(url).then((res: any) => res.json());
        network = result.default_node_info.network;
        if (network.startsWith(chain)) {
          break;
        }
      } catch (e) {
        // do nothing
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    if (!network.startsWith(chain)) {
      throw new Error(`${chain} lcd server failed to start in ${timeout}ms`);
    }
  }

  async isDockerRunning(dockerPath: string): Promise<boolean> {
    return ps({ cwd: dockerPath })
      .then(() => true)
      .catch((e) => {
        logger.log(e);
        return false;
      });
  }

  async throwIfDockerNotFound() {
    try {
      execSync(`command -v docker 2>/dev/null`);
    } catch (error) {
      throw new Error('"docker" command is not available.');
    }
  }

  private async throwIfDockerNotRunning(dockerPath: string): Promise<void> {
    if (!(await this.isDockerRunning(dockerPath))) {
      throw new Error(
        "Docker is not running. Please start Docker and try again."
      );
    }
  }
}
