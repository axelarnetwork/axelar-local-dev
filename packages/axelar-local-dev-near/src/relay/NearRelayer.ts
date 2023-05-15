import { ethers } from 'ethers';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import { nearNetwork } from '..';
import {
    Network,
    networks,
    getNearLogID,
    getSignedExecuteInput,
    logger,
    Relayer,
    CallContractArgs,
    NativeGasPaidForContractCallArgs,
    Command,
    CallContractWithTokenArgs,
    RelayData,
    RelayerType,
    RelayCommand,
} from '@axelar-network/axelar-local-dev';
import { Command as NearCommand } from './Command';

const AddressZero = ethers.constants.AddressZero;

interface NearRelayerOptions {
    aptosRelayer?: Relayer;
}

export class NearRelayer extends Relayer {
    constructor(options: NearRelayerOptions = {}) {
        super();
        this.otherRelayers.aptos = options.aptosRelayer;
    }

    setRelayer(type: RelayerType, relayer: Relayer) {
        this.otherRelayers[type] = relayer;
    }

    async updateEvents() {
        await this.updateGasEvents();
        await this.updateCallContractEvents();
    }

    async execute(commands: RelayCommand) {
        await this.executeNearToEvm(commands);
        await this.executeEvmToNear(commands);
        await this.otherRelayers?.aptos?.execute(commands);
    }

    private async executeEvmToNear(commands: RelayCommand) {
        const toExecute = commands['near'];
        if (toExecute?.length == 0) return;

        await nearNetwork?.executeGateway(toExecute);
        for (const command of toExecute) {
            if (!command.post) continue;
            await command.post({});
        }
    }

    private async executeNearToEvm(relayCommands: RelayCommand) {
        for (const to of networks) {
            const commands = relayCommands[to.name];
            if (commands.length === 0) continue;

            const execution = await this.executeEvmGateway(to, commands);
            await this.executeEvmExecutable(to, commands, execution);
        }
    }

    // Events
    private async updateGasEvents() {
        const events = nearNetwork.queryPayGasContractCallEvents();

        for (const event of events) {
            const args: NativeGasPaidForContractCallArgs = {
                sourceAddress: event.data.source_address,
                destinationAddress: event.data.destination_address,
                gasFeeAmount: event.data.gas_fee_amount,
                destinationChain: event.data.destination_chain,
                payloadHash: event.data.payload_hash,
                refundAddress: event.data.refund_address,
                gasToken: AddressZero,
            };

            this.contractCallGasEvents.push(args);
        }
    }

    private async updateCallContractEvents() {
        const events = nearNetwork.queryContractCallEvents();

        for (const event of events) {
            const commandId = getNearLogID('near', event);
            const contractCallArgs: CallContractArgs = {
                from: 'near',
                to: event.data.destination_chain,
                sourceAddress: event.data.address,
                destinationContractAddress: event.data.destination_contract_address,
                payload: event.data.payload,
                payloadHash: event.data.payload_hash,
                transactionHash: '',
                sourceEventIndex: 0,
            };
            this.relayData.callContract[commandId] = contractCallArgs;
            const command = Command.createEVMContractCallCommand(commandId, this.relayData, contractCallArgs);
            this.commands[contractCallArgs.to].push(command);
        }
    }

    // EVM
    private async executeEvmGateway(to: Network, commands: Command[]): Promise<void> {
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
        for (const command of commands) {
            if (command.post == null) continue;
            try {
                await command.post({});
            } catch (e) {
                logger.log(e);
            }
        }
    }

    createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command {
        return NearCommand.createCallContractCommand(commandId, relayData, contractCallArgs);
    }

    // TODO: implement
    createCallContractWithTokenCommand(
        commandId: string,
        relayData: RelayData,
        callContractWithTokenArgs: CallContractWithTokenArgs
    ): Command {
        throw new Error('Method not implemented.');
    }
}
