import { ethers } from 'ethers';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import {
    logger,
    getSignedExecuteInput,
    RelayCommand,
    Network,
    networks,
    getGasPrice,
    Command,
    Relayer,
    RelayerType,
    CallContractArgs,
    RelayData,
} from '@axelar-network/axelar-local-dev';
import { Command as SuiCommand } from './Command';

const AddressZero = ethers.constants.AddressZero;

export class SuiRelayer extends Relayer {
    constructor() {
        super();
    }

    setRelayer(type: RelayerType, _: Relayer) {
        if (type === 'near') {
            console.log('near not supported yet');
        }
    }

    async updateEvents(): Promise<void> {
        await this.updateGasEvents();
        await this.updateCallContractEvents();
    }

    async execute(commands: RelayCommand) {
        await this.executeSuiToEvm(commands);
        await this.executeEvmToSui(commands);
    }

    async executeSuiToEvm(commandList: RelayCommand) {
        for (const to of networks) {
            const commands = commandList[to.name];
            if (commands.length == 0) continue;

            const execution = await this.executeEvmGateway(to, commands);
            await this.executeEvmExecutable(to, commands, execution);
        }
    }

    private async executeEvmToSui(commands: RelayCommand) {
        const toExecute = commands['sui'];
        if (toExecute?.length === 0) return;

        await this.executeSuiGateway(toExecute);
        await this.executeSuiExecutable(toExecute);
    }

    private async executeSuiGateway(commands: Command[]) {
        // TODO: Send approve_contract_call tx to Axelar Gateway
    }

    private async executeSuiExecutable(commands: Command[]) {
        for (const command of commands) {
            if (!command.post) continue;

            await command.post({});
        }
    }

    private async executeEvmGateway(to: Network, commands: Command[]): Promise<void> {
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [to.chainId, commands.map((com) => com.commandId), commands.map((com) => com.name), commands.map((com) => com.encodedData)],
            ),
        );
        const signedData = await getSignedExecuteInput(data, to.operatorWallet);

        return to.gateway
            .connect(to.ownerWallet)
            .execute(signedData, { gasLimit: BigInt(8e6) })
            .then((tx: any) => tx.wait());
    }

    private async executeEvmExecutable(to: Network, commands: Command[], execution: any): Promise<void> {
        for (const command of commands) {
            if (command.post == null) continue;

            if (
                !execution.events.find((event: any) => {
                    return event.event === 'Executed' && event.args[0] == command.commandId;
                })
            )
                continue;

            const payed =
                command.name == 'approveContractCall'
                    ? this.contractCallGasEvents.find((log: any) => {
                          if (log.sourceAddress.toLowerCase() != command.data[1].toLowerCase()) return false;
                          if (log.destinationChain.toLowerCase() != to.name.toLowerCase()) return false;
                          if (log.destinationAddress.toLowerCase() != command.data[2].toLowerCase()) return false;
                          if (log.payloadHash.toLowerCase() != command.data[3].toLowerCase()) return false;
                          return true;
                      })
                    : false;

            if (!payed) continue;
            if (command.name == 'approveContractCall') {
                const index = this.contractCallGasEvents.indexOf(payed);
                this.contractCallGasEvents = this.contractCallGasEvents.filter((_, i) => i !== index);
            } else {
                const index = this.contractCallWithTokenGasEvents.indexOf(payed);
                this.contractCallWithTokenGasEvents = this.contractCallWithTokenGasEvents.filter((_, i) => i !== index);
            }
            try {
                const cost = getGasPrice();
                const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);
                await command.post({
                    gasLimit: BigInt(Math.min(blockLimit, payed.gasFeeAmount / cost)),
                });
            } catch (e) {
                logger.log(e);
            }
        }
    }

    private async updateGasEvents() {
        // TODO: Query Sui gas events here
    }

    private async updateCallContractEvents() {
        // TODO: Query Sui contract call events here
        const events: any[] = [];

        for (const event of events) {
            // TODO: Generate commandId for Sui
            const commandId = '1234';

            const contractCallArgs: CallContractArgs = {
                from: 'sui',
                to: event.data.destinationChain,
                sourceAddress: event.data.sourceAddress,
                destinationContractAddress: event.data.destinationAddress,
                payload: event.data.payload,
                payloadHash: event.data.payloadHash,
                transactionHash: '',
                sourceEventIndex: 0,
            };
            this.relayData.callContract[commandId] = contractCallArgs;
            const command = Command.createEVMContractCallCommand(commandId, this.relayData, contractCallArgs);
            this.commands[contractCallArgs.to].push(command);
        }
    }

    createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command {
        return SuiCommand.createContractCallCommand(commandId, relayData, contractCallArgs);
    }
    createCallContractWithTokenCommand(): Command {
        throw new Error('Method not implemented.');
    }
}
