import { ContractCallSubmitted, CosmosChainInfo, IBCEvent } from "../types";
import { AxelarCosmosContractCallEvent, AxelarListener } from "../listeners";
import {
  CallContractArgs,
  CallContractWithTokenArgs,
  Command,
  getSignedExecuteInput,
  logger,
  Network,
  networks,
  RelayCommand,
  RelayData,
  Relayer,
  RelayerType,
} from "@axelar-network/axelar-local-dev";
import { Command as WasmCommand } from "../Command";
import { ethers } from "ethers";
import { arrayify, defaultAbiCoder } from "ethers/lib/utils";
import { CosmosClient } from "../clients";

export class AxelarRelayerService extends Relayer {
  private axelarListener: AxelarListener;
  private wasmClient: CosmosClient;
  private listened = false;

  private constructor(
    axelarListener: AxelarListener,
    wasmClient: CosmosClient
  ) {
    super();
    this.axelarListener = axelarListener;
    this.wasmClient = wasmClient;
  }

  static async create(axelarConfig: Omit<CosmosChainInfo, "owner">) {
    const axelarListener = new AxelarListener(axelarConfig);
    const wasmClient = await CosmosClient.create("wasm");
    return new AxelarRelayerService(axelarListener, wasmClient);
  }

  updateEvents(): Promise<void> {
    if (this.listened) return Promise.resolve();

    this.axelarListener.listen(AxelarCosmosContractCallEvent, async (args) => {
      console.log("Received ContractCall", args);
      this.updateCallContractEvents(args);
    });

    this.listened = true;
    return Promise.resolve();
  }

  async execute(commands: RelayCommand): Promise<void> {
    await this.executeWasmToEvm(commands);
    await this.executeEvmToWasm(commands);
  }

  private async executeEvmToWasm(command: RelayCommand) {
    const toExecute = command["wasm"];
    if (toExecute?.length === 0) return;

    await this.executeWasmExecutable(toExecute);
  }

  private async executeWasmExecutable(commands: Command[]) {
    for (const command of commands) {
      if (command.post == null) continue;

      try {
        await command.post(this.wasmClient);
      } catch (e) {
        logger.log(e);
      }
    }
  }

  private async executeWasmToEvm(command: RelayCommand) {
    for (const to of networks) {
      const commands = command[to.name];
      if (commands.length == 0) continue;

      const execution = await this.executeEvmGateway(to, commands);
      await this.executeEvmExecutable(to, commands, execution);
    }
  }

  createCallContractCommand(
    commandId: string,
    relayData: RelayData,
    contractCallArgs: CallContractArgs
  ): Command {
    return WasmCommand.createWasmContractCallCommand(
      commandId,
      relayData,
      contractCallArgs
    );
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

  private async updateCallContractEvents(
    event: IBCEvent<ContractCallSubmitted>
  ) {
    const { args } = event;
    const contractCallArgs: CallContractArgs = {
      from: "wasm",
      to: args.destinationChain,
      sourceAddress: args.sender,
      destinationContractAddress: args.contractAddress,
      payload: args.payload,
      payloadHash: args.payloadHash,
      transactionHash: event.hash,
      sourceEventIndex: 0,
    };
    const commandId = this.getWasmLogID(event);
    this.relayData.callContract[commandId] = contractCallArgs;
    const command = Command.createEVMContractCallCommand(
      commandId,
      this.relayData,
      contractCallArgs
    );
    this.commands[contractCallArgs.to].push(command);
  }

  private getWasmLogID(event: IBCEvent<ContractCallSubmitted>) {
    return ethers.utils.id(
      `${event.args.messageId}-${event.args.sourceChain}-${event.args.destinationChain}`
    );
  }

  private async executeEvmGateway(
    to: Network,
    commands: Command[]
  ): Promise<void> {
    const data = arrayify(
      defaultAbiCoder.encode(
        ["uint256", "bytes32[]", "string[]", "bytes[]"],
        [
          to.chainId,
          commands.map((com) => com.commandId),
          commands.map((com) => com.name),
          commands.map((com) => com.encodedData),
        ]
      )
    );
    const signedData = await getSignedExecuteInput(data, to.operatorWallet);

    return to.gateway
      .connect(to.ownerWallet)
      .execute(signedData, { gasLimit: BigInt(8e6) })
      .then((tx: any) => tx.wait());
  }

  private async executeEvmExecutable(
    to: Network,
    commands: Command[],
    execution: any
  ): Promise<void> {
    for (const command of commands) {
      if (command.post == null) continue;

      const isExecuted = !execution.events.find((event: any) => {
        return event.event === "Executed" && event.args[0] == command.commandId;
      });

      if (isExecuted) {
        continue;
      }

      try {
        const blockLimit = Number(
          (await to.provider.getBlock("latest")).gasLimit
        );
        await command.post({
          gasLimit: blockLimit,
        });
      } catch (e) {
        logger.log(e);
      }
    }
  }
}
