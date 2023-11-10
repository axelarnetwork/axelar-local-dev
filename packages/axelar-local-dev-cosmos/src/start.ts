import { AxelarRelayerService } from "./services";
import { defaultAxelarChainInfo } from "./";

export let cosmosRelayer: AxelarRelayerService;

export const createRelayer = async () => {
  cosmosRelayer = await AxelarRelayerService.create(defaultAxelarChainInfo);
};
