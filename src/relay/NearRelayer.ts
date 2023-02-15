import { ethers } from 'ethers';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import { nearNetwork } from '../near';
import { Network, networks } from '../Network';
import { getNearLogID, getSignedExecuteInput, logger } from '../utils';
import { Command } from './Command';
import { Relayer } from './Relayer';
import { CallContractArgs, NativeGasPaidForContractCallArgs } from './types';

const AddressZero = ethers.constants.AddressZero;

export class NearRelayer extends Relayer {
    constructor() {
        super();
    }

    async updateEvents() {
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

        /**
         *
         *   {"standard":"axelar_near","version":"1.0.0","event":"contract_call_event","data":{"address":"axelar_auth_weighted.test.near","destination_chain":"Polygon","destination_contract_address":"0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88","payload_hash":"0xcead85dcdfcdc3f9aa5aa82658669488859283d53026229b179f017824d15a1f","payload":"0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c80000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"}}
         */
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
}
