import { CosmosChainInfo } from "../types";
import { AxelarCosmosContractCallEvent, AxelarListener } from "../listeners";

export class AxelarRelayerService {
  private axelarListener: AxelarListener;

  private constructor(config: Omit<CosmosChainInfo, "owner">) {
    this.axelarListener = new AxelarListener(config);
  }

  async listenCallContract() {
    this.axelarListener.listen(AxelarCosmosContractCallEvent, async (args) => {
      console.log("Received ContractCall", args);
    });
  }

  private validateContractCall() {
    // TODO:
  }
}
