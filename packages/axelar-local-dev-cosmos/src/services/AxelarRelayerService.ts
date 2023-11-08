import { ContractCallSubmitted, CosmosChainInfo, IBCEvent } from "../types";
import { AxelarCosmosContractCallEvent, AxelarListener } from "../listeners";
import {
  CallContractArgs,
  CallContractWithTokenArgs,
  Command,
  RelayCommand,
  RelayData,
  Relayer,
  RelayerType,
} from "@axelar-network/axelar-local-dev";

export class AxelarRelayerService extends Relayer {
  private axelarListener: AxelarListener;
  private wasmConfig: Omit<CosmosChainInfo, "owner">;

  private constructor(
    axelarConfig: Omit<CosmosChainInfo, "owner">,
    wasmConfig: Omit<CosmosChainInfo, "owner">
  ) {
    super();
    this.axelarListener = new AxelarListener(axelarConfig);
    this.wasmConfig = wasmConfig;
  }

  async listenCallContract() {
    this.axelarListener.listen(AxelarCosmosContractCallEvent, async (args) => {
      console.log("Received ContractCall", args);
      if (this.validateContractCall(args)) {
      }
    });
  }

  updateEvents(): Promise<void> {
    // no-op since the events will be updated in listenCallContract function.
    return Promise.resolve();
  }

  execute(commands: RelayCommand): Promise<void> {
    throw new Error("Method not implemented.");
    // use the cosmos client here execute method on wasm contract...
  }

  createCallContractCommand(
    commandId: string,
    relayData: RelayData,
    contractCallArgs: CallContractArgs
  ): Command {
    throw new Error("Method not implemented.");
  }

  createCallContractWithTokenCommand(
    commandId: string,
    relayData: RelayData,
    callContractWithTokenArgs: CallContractWithTokenArgs
  ): Command {
    throw new Error(
      "Currently, this method is not supported. Please use createCallContractCommand instead."
    );
  }

  setRelayer(type: RelayerType, relayer: Relayer): void {
    if (type !== "evm") {
      return console.log(`${type} not supported yet`);
    }

    // this.relayer = relayer;
  }

  // Response
  // {
  //   hash: '45AD7FC99B99AC51A0D5D380B0ECB7920612E5A11BCFD64EF23602DAFF0C2042',
  //   srcChannel: 'channel-0',
  //   destChannel: 'channel-0',
  //   args: {
  //     messageId: '0x45ad7fc99b99ac51a0d5d380b0ecb7920612e5a11bcfd64ef23602daff0c2042-0',
  //     sender: 'wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d',
  //     sourceChain: 'wasm',
  //     destinationChain: 'Ethereum',
  //     contractAddress: '0x49324C7f83568861AB1b66E547BB1B66431f1070',
  //     payload: '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002b7761736d313264737676706a3566386336756a357475366e33707230646c3264366175617a6d6c33373935000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000548656c6c6f000000000000000000000000000000000000000000000000000000',
  //     payloadHash: '0xfd9cfe7a2a8e928ed3fe02131dcc235ea5717d77a9410b9b80dff5fa13e0598c'
  //   }
  // }
  private validateContractCall(args: IBCEvent<ContractCallSubmitted>) {
    // TODO: Check if the contract call is valid
    // 1: Check if the destination chain is valid
    // 2: How do we craft the data for the approve gateway at the destination chain
    // 3:
  }
}
