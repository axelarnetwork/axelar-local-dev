import { logger } from "@axelar-network/axelar-local-dev";
import { AxelarRelayerService, IBCRelayerService } from "./services";
import { retry } from ".";
import { DockerService } from "./services/DockerService";

export const testMnemonic =
  "illness step primary sibling donkey body sphere pigeon inject antique head educate";
export let cosmosRelayer: AxelarRelayerService;
export let ibcRelayer: IBCRelayerService;
export let dockerService: DockerService = new DockerService();

const getOrCreateIBCRelayer = async () => {
  if (!ibcRelayer) {
    ibcRelayer = await IBCRelayerService.create(testMnemonic);
  }

  return ibcRelayer;
};

export const setupIBCChannels = async () => {
  ibcRelayer = await getOrCreateIBCRelayer();

  logger.log("Setting up IBC Channels");
  await retry(async () => {
    await ibcRelayer.setup();
  });
  logger.log("IBC Channels setup completed!");
};

export const startAll = async () => {
  await startCosmosChains();
  await setupIBCChannels();
};

export const stopAll = async () => {
  await stopCosmosChains();
};

export const startCosmosChains = async () => {
  // Start all docker containers including wasm chain, axelar chain, and traefik
  await dockerService.startAll()
};

export const stopCosmosChains = async () => {
  await dockerService.stopAll();
};

export const startIBCRelayer = async () => {
  ibcRelayer = await getOrCreateIBCRelayer();

  await ibcRelayer.runInterval();
  logger.log("IBC relayer started");
};

export const stopIBCRelayer = async () => {
  ibcRelayer = await getOrCreateIBCRelayer();

  await ibcRelayer.stopInterval();
  logger.log("IBC relayer stopped");
};
