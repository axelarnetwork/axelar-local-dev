import { ContractCallSubmitted, ContractCallWithTokenSubmitted, CosmosChainInfo, IBCEvent } from "../types";
import { AxelarCosmosContractCallEvent, AxelarCosmosContractCallWithTokenEvent, AxelarListener, AxelarTokenSentEvent } from "../listeners";
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
import { IBCRelayerService } from "./IBCRelayerService";

export class AxelarRelayerService extends Relayer {
  private axelarListener: AxelarListener;
  public axelarClient: CosmosClient;
  private listened = false;
  public ibcRelayer: IBCRelayerService;

  private constructor(
    axelarListener: AxelarListener,
    axelarClient: CosmosClient,
    ibcRelayer: IBCRelayerService
  ) {
    super();
    this.axelarListener = axelarListener;
    this.axelarClient = axelarClient;
    this.ibcRelayer = ibcRelayer;
  }

  static async create(
    axelarConfig: Omit<CosmosChainInfo, "owner">,
    ibcRelayer?: IBCRelayerService
  ) {
    const axelarListener = new AxelarListener(axelarConfig);
    const axelarClient = await CosmosClient.create("axelar", "smile unveil sketch gaze length bulb goddess street case exact table fetch robust chronic power choice endorse toward pledge dish access sad illegal dance");
    const _ibcRelayer = ibcRelayer || (await IBCRelayerService.create());
    await _ibcRelayer.createIBCChannelIfNeeded();

    return new AxelarRelayerService(axelarListener, axelarClient, _ibcRelayer);
  }

  async updateEvents() {
    await this.listenForEvents();
    await this.ibcRelayer.relay();
  }

  async listenForEvents() {
    if (this.listened) return;

    this.axelarListener.listen(
      AxelarCosmosContractCallEvent,
      this.handleContractCallEvent.bind(this)
    );

    this.axelarListener.listen(
      AxelarCosmosContractCallWithTokenEvent,
      this.handleContractCallWithTokenEvent.bind(this)
    );


    this.listened = true;
  }

  private async handleContractCallEvent(args: any) {
    this.updateCallContractEvents(args);
    await this.execute(this.commands);
  }

  private async handleContractCallWithTokenEvent(args: any) {
    this.updateCallContractWithTokenEvents(args);
    await this.execute(this.commands);
  }


  async stopListening() {
    await this.axelarListener.stop();

    this.listened = false;
  }

  async execute(commands: RelayCommand) {
    await this.executeWasmToEvm(commands);
    await this.executeEvmToWasm(commands);
  }

  private async executeEvmToWasm(command: RelayCommand) {
    const toExecute = command["agoric"];
    if (!toExecute || toExecute?.length === 0) return;

    await this.executeWasmExecutable(toExecute);
  }

  private async executeWasmExecutable(commands: Command[]) {
    for (const command of commands) {
      if (command.post == null) continue;

      try {
        await command.post(this.axelarClient);
      } catch (e) {
        logger.log(e);
      }
    }
  }

  private async executeWasmToEvm(command: RelayCommand) {
    for (const to of networks) {
      const commands = command[to.name];
      if (!commands || commands?.length == 0) continue;

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
  }

  private async updateCallContractEvents(
    event: IBCEvent<ContractCallSubmitted>
  ) {
    const { args } = event;
    const contractCallArgs: CallContractArgs = {
      from: "agoric",
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

    if (!this.commands[contractCallArgs.to]) {
      this.commands[contractCallArgs.to] = [];
    }

    this.commands[contractCallArgs.to].push(command);
  }
  private async updateCallContractWithTokenEvents(
    event: IBCEvent<ContractCallWithTokenSubmitted>
  ) {
    const tokenMap: {[key:string]: string} = {
      'uausdc': 'aUSDC',
      'ubld': 'aUSDC',
      } 
    if (!tokenMap[event.args.symbol]) {
      throw new Error('Token not supported yet');
    }

    const { args } = event;
    const contractCallWithTokenArgs: CallContractWithTokenArgs = {
      from: "agoric",
      to: args.destinationChain,
      sourceAddress: args.sender,
      destinationContractAddress: args.contractAddress,
      payload: args.payload,
      payloadHash: args.payloadHash,
      alias: "??",
      destinationTokenSymbol: tokenMap[args.symbol],
      amountIn: args.amount,
      amountOut: args.amount,
    };

    const commandId = this.getWasmLogID(event);
    this.relayData.callContractWithToken[commandId] = contractCallWithTokenArgs;
    const command = Command.createEVMContractCallWithTokenCommand(
      commandId,
      this.relayData,
      contractCallWithTokenArgs
    );

    if (!this.commands[contractCallWithTokenArgs.to]) {
      this.commands[contractCallWithTokenArgs.to] = [];
    }

    this.commands[contractCallWithTokenArgs.to].push(command);
  }
  
  private getWasmLogID(event: IBCEvent<ContractCallSubmitted>) {
    return ethers.utils.id(
      `${event.args.messageId}-${event.args.sourceChain}-${event.args.destinationChain}`
    );
  }

  private async executeEvmGateway(to: Network, commands: Command[]) {
    const data = this.encodeGatewayData(to, commands);
    const signedData = await getSignedExecuteInput(data, to.operatorWallet);

    return this.sendExecuteTransaction(to, signedData);
  }

  private encodeGatewayData(to: Network, commands: Command[]) {
    return arrayify(
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
  }

  private async sendExecuteTransaction(to: Network, signedData: any) {
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
          return command.post({
            gasLimit: blockLimit,
          });
      } catch (e) {
        logger.log(e);
      }
    }
  }
}
