import { ethers } from 'ethers';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import { getAptosLogID } from './utils';
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
    NativeGasPaidForContractCallArgs,
    RelayData,
} from '@axelar-network/axelar-local-dev';
import { Command as MultiversXCommand } from './Command';
import { multiversXNetwork } from './multiversXNetworkUtils';

const AddressZero = ethers.constants.AddressZero;

export class MultiversXRelayer extends Relayer {
    constructor() {
        super();
    }

    setRelayer(type: RelayerType, _: Relayer) {
        if (type === 'near' || type === 'aptos') {
            console.log('near or aptos not supported yet');
        }
    }

    async updateEvents(): Promise<void> {
        await this.updateGasEvents();
        await this.updateCallContractEvents();
    }

    async execute(commands: RelayCommand) {
        await this.executeMultiversXToEvm(commands);
        await this.executeEvmToMultiversX(commands);
    }

    async executeMultiversXToEvm(commandList: RelayCommand) {
        console.log('Execute MultiversX to EVM...');

        for (const to of networks) {
            const commands = commandList[to.name];
            if (commands.length == 0) continue;

            const execution = await this.executeEvmGateway(to, commands);
            await this.executeEvmExecutable(to, commands, execution);
        }
    }

    private async executeEvmToMultiversX(commands: RelayCommand) {
        console.log('Execute EVM to MultiversX...')

        const toExecute = commands['multiversx'];
        if (toExecute?.length === 0) return;

        await this.executeMultiversXGateway(toExecute);
        await this.executeMultiversXExecutable(toExecute);
    }

    private async executeMultiversXGateway(commands: Command[]) {
        console.log('Execute MultiversX Gateway...')

        if (!multiversXNetwork) return;
        for (const command of commands) {
            await multiversXNetwork.executeGateway(command.name, command.commandId, command.data[0], command.data[1], command.data[2], command.data[3], command.data[4], command.data[5]);
        }
    }

    private async executeMultiversXExecutable(commands: Command[]) {
        console.log('Execute MultiversX Executable...')

        if (!multiversXNetwork) return;
        for (const command of commands) {
            if (!command.post) continue;

            await command.post({});
        }
    }

    private async executeEvmGateway(to: Network, commands: Command[]): Promise<void> {
        console.log('Execute Evm Gateway...')

        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [to.chainId, commands.map((com) => com.commandId), commands.map((com) => com.name), commands.map((com) => com.encodedData)]
            )
        );
        const signedData = await getSignedExecuteInput(data, to.operatorWallet);

        return to.gateway
            .connect(to.ownerWallet)
            .execute(signedData, { gasLimit: BigInt(8e6) })
            .then((tx: any) => tx.wait());
    }

    private async executeEvmExecutable(to: Network, commands: Command[], execution: any): Promise<void> {
        console.log('Execute Evm Executable...')

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
        console.log('Update Gas Events...')

        // const events = await multiversXNetwork.queryPayGasContractCallEvents();
        // multiversXNetwork.updatePayGasContractCallSequence(events);
        //
        // for (const event of events) {
        //     const args: NativeGasPaidForContractCallArgs = {
        //         sourceAddress: event.data.source_address,
        //         destinationAddress: event.data.destination_address,
        //         gasFeeAmount: event.data.gas_fee_amount,
        //         destinationChain: event.data.destination_chain,
        //         payloadHash: event.data.payload_hash,
        //         refundAddress: event.data.refund_address,
        //         gasToken: AddressZero,
        //     };
        //
        //     this.contractCallGasEvents.push(args);
        // }
    }

    private async updateCallContractEvents() {
        console.log('Update Call Contract Events...')

        // const events = await multiversXNetwork.queryContractCallEvents();
        // multiversXNetwork.updateContractCallSequence(events);
        //
        // for (const event of events) {
        //     const commandId = getAptosLogID('aptos', event);
        //
        //     const contractCallArgs: CallContractArgs = {
        //         from: 'multiversx',
        //         to: event.data.destinationChain,
        //         sourceAddress: event.data.sourceAddress,
        //         destinationContractAddress: event.data.destinationAddress,
        //         payload: event.data.payload,
        //         payloadHash: event.data.payloadHash,
        //         transactionHash: '',
        //         sourceEventIndex: 0,
        //     };
        //     this.relayData.callContract[commandId] = contractCallArgs;
        //     const command = Command.createEVMContractCallCommand(commandId, this.relayData, contractCallArgs);
        //     this.commands[contractCallArgs.to].push(command);
        // }
    }

    createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command {
        console.log('Create call contract command...')

        return MultiversXCommand.createContractCallCommand(commandId, relayData, contractCallArgs);
    }

    createCallContractWithTokenCommand(): Command {
        console.log('Create call contract with token command...')

        throw new Error('Method not implemented.');
    }
}
