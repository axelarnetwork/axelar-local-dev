import { ethers } from 'ethers';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import { aptosNetwork } from '../aptos';
import { Network, networks } from '../Network';
import { getGasPrice } from '../networkUtils';
import { getAptosLogID, getSignedExecuteInput, logger } from '../utils';
import { Command } from './Command';
import { Relayer } from './Relayer';
import { CallContractArgs, CallContractWithTokenArgs, NativeGasPaidForContractCallArgs, RelayData } from './types';
const AddressZero = ethers.constants.AddressZero;

export class AptosRelayer extends Relayer {
    constructor() {
        super();
    }

    async updateEvents(): Promise<void> {
        await this.updateGasEvents();

        await this.updateCallContractEvents();
    }

    async execute() {
        for (const to of networks) {
            const commands = this.commands[to.name];
            if (commands.length == 0) continue;

            const execution = await this.executeEvmGateway(to, commands);

            await this.executeEvmExecutable(to, commands, execution);
        }
    }

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
                this.contractCallGasEvents.splice(index, 1);
            } else {
                const index = this.contractCallWithTokenGasEvents.indexOf(payed);
                this.contractCallWithTokenGasEvents.splice(index, 1);
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
        const events = await aptosNetwork.queryPayGasContractCallEvents();
        aptosNetwork.updatePayGasContractCallSequence(events);

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
        const events = await aptosNetwork.queryContractCallEvents();
        aptosNetwork.updateContractCallSequence(events);

        for (const event of events) {
            const commandId = getAptosLogID('aptos', event);

            const contractCallArgs: CallContractArgs = {
                from: 'aptos',
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
        throw new Error('Method not implemented.');
    }
    createCallContractWithTokenCommand(
        commandId: string,
        relayData: RelayData,
        callContractWithTokenArgs: CallContractWithTokenArgs
    ): Command {
        throw new Error('Method not implemented.');
    }
}
