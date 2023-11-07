import path from "path";
import { IDockerComposeOptions, v2 as compose } from "docker-compose";
import { CosmosChain } from "../types";
import { logger } from "@axelar-network/axelar-local-dev";
import { retry } from "../utils";

export async function stopAll() {
  retry(async () => {
    console.log("Stopping all containers...");
    await stop("axelar");
    await stop("wasm");
    await stopTraefik();
    console.log("All containers stopped");
  });
}

export async function stopTraefik() {
  const traefikPath = path.join(__dirname, "../../docker/traefik");
  const config: IDockerComposeOptions = {
    cwd: traefikPath,
  };

  console.log("Stopping traefik container...");

  await compose.down(config);

  console.log("Traefik stopped");
}

/**
 * Stop docker container
 */
export async function stop(chain: CosmosChain) {
  logger.log(`Stopping ${chain} container...`);
  const dockerPath = path.join(__dirname, `../../docker/${chain}`);
  try {
    await compose.down({
      cwd: dockerPath,
    });
  } catch (e: any) {
    logger.log(e);
  }
  logger.log(`${chain} stopped`);
}
