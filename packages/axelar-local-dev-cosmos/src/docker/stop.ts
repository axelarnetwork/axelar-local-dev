import { v2 as compose } from "docker-compose";
import { defaultConfig as axelarConfig } from "../axelar";
import { defaultConfig as wasmConfig } from "../wasm";
import { CosmosChain } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";

export async function stopAll() {
  return Promise.all([
    stop("axelar", axelarConfig.dockerPath),
    stop("wasm", wasmConfig.dockerPath),
  ]);
}

/**
 * Stop docker container
 */
export async function stop(chain: CosmosChain, dockerPath: string) {
  logger.log(`Stopping ${chain}...`);
  try {
    await compose.down({
      cwd: dockerPath,
    });
  } catch (e: any) {
    logger.log(e);
  }
  logger.log(`${chain} stopped`);
}
