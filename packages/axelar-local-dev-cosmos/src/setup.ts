import { logger } from "@axelar-network/axelar-local-dev";
import { AxelarRelayerService, IBCRelayerService } from "./services";
import { retry } from ".";
import { DockerService } from "./services/DockerService";

// Warning: this mnemonic is used for testing only. Do not use it in production.
export const testMnemonic =
  "illness step primary sibling donkey body sphere pigeon inject antique head educate";

export let cosmosRelayer: AxelarRelayerService;
export let ibcRelayer: IBCRelayerService;
export let dockerService: DockerService = new DockerService();

/**
 * Retrieves an existing IBCRelayerService instance or creates a new one if it doesn't exist.
 * This function ensures that there is always a single instance of IBCRelayerService being used.
 *
 * @returns {Promise<IBCRelayerService>} A promise that resolves to an instance of IBCRelayerService.
 */
const getOrCreateIBCRelayer = async () => {
  if (!ibcRelayer) {
    ibcRelayer = await IBCRelayerService.create(testMnemonic);
  }

  return ibcRelayer;
};

/**
 * Sets up IBC channels using the IBCRelayerService between Axelar and Wasm chain.
 * It initializes the IBCRelayerService if not already done and attempts to set up IBC channels.
 *
 * @throws {Error} Throws an error if setting up IBC channels fails.
 */
export const setupIBCChannels = async () => {
  ibcRelayer = await getOrCreateIBCRelayer();

  logger.log("Setting up IBC Channels");
  await retry(async () => {
    await ibcRelayer.createIBCChannelIfNeeded();
  });
  logger.log("IBC Channels setup completed!");
};

/**
 * Starts all necessary services including Axelar, Wasm Chains in docker containers and IBC channels.
 * This function is a high-level method to initiate all the required components for the relayer service.
 */
export const startChains = async () => {
  await startCosmosChains();
  await setupIBCChannels();
};

/**
 * Stops all services including all docker containers and the IBC relayer.
 * This method ensures a graceful shutdown of all running services.
 */
export const stopAll = async () => {
  await stopCosmosChains();
  await stopIBCRelayer();
};

/**
 * Starts all Cosmos chains using the DockerService.
 * It invokes the `DockerService.startChains` method to spin up Axelar and Wasm chains.
 */
export const startCosmosChains = async () => {
  await dockerService.startChains();
};

/**
 * Stop all Cosmos chains.
 * It invokes the `DockerService.startChains` method to spin up Axelar and Wasm chains.
 */
export const stopCosmosChains = async () => {
  await dockerService.stopAll();
};

/**
 * Starts the IBC relayer service.
 * It initializes the IBCRelayerService if necessary and starts the relaying process.
 *
 * @throws {Error} Throws an error if starting the IBC relayer fails.
 */
export const startIBCRelayer = async () => {
  try {
    const relayer = await getOrCreateIBCRelayer();
    await relayer.runInterval();
    logger.log("IBC relayer started");
  } catch (error) {
    logger.log("Error starting IBC Relayer: ", error);
    throw error;
  }
};

/**
 * Stops the IBC relayer service.
 * This method is used to stop the interval running in the IBCRelayerService.
 *
 * @throws {Error} Throws an error if stopping the IBC relayer fails.
 */
export async function stopIBCRelayer() {
  try {
    const relayer = await getOrCreateIBCRelayer();
    await relayer.stopInterval();
    logger.log("IBC relayer stopped");
  } catch (error) {
    logger.log("Error stopping IBC Relayer: ", error);
    throw error;
  }
}
