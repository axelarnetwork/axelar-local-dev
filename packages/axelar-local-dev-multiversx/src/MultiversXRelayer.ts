import { ethers } from 'ethers';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
import {
    CallContractArgs,
    Command,
    getGasPrice,
    getSignedExecuteInput,
    logger,
    NativeGasPaidForContractCallArgs,
    Network,
    networks,
    RelayCommand,
    RelayData,
    Relayer,
    RelayerType
} from '@axelar-network/axelar-local-dev';
import { Command as MultiversXCommand } from './Command';
import { multiversXNetwork } from './multiversXNetworkUtils';
import {
    Address,
    AddressType,
    AddressValue,
    BigUIntType,
    BigUIntValue,
    BinaryCodec,
    BytesType,
    BytesValue,
    H256Type,
    H256Value,
    StringType,
    TupleType
} from '@multiversx/sdk-core/out';
import { getMultiversXLogID } from './utils';

const AddressZero = ethers.constants.AddressZero;

const { Client } = require('@elastic/elasticsearch');

interface MultiversXEvent {
    identifier: string;
    address: string;
    data: string;
    topics: string[];
    order: number;
    txHash?: string;
}

export class MultiversXRelayer extends Relayer {
    private readonly elasticsearch;

    private initialHitsLength: number = -1;

    constructor() {
        super();

        this.elasticsearch = new Client({
            node: 'http://127.0.0.1:9200'
        });
    }

    setRelayer(type: RelayerType, _: Relayer) {
        if (type !== RelayerType.Evm) {
            console.log('Only evm is supported for multiversx');
        }
    }

    async updateEvents(): Promise<void> {
        const logsCount = await this.elasticsearch.count({
            index: 'logs'
        });
        const count = logsCount.count;

        // Skip processing if no new logs
        if (this.initialHitsLength == -1) {
            this.initialHitsLength = count;
        }
        if (this.initialHitsLength === count) {
            return;
        }

        // Process only new events
        const logs = await this.elasticsearch.search({
            index: 'logs',
            sort: [
                { timestamp: 'desc' }
            ],
            size: count - this.initialHitsLength
        });
        const hits = logs.hits.hits;

        const newHits: MultiversXEvent[] = hits
            .reduce((acc: any, hit: any) => {
                const newEvents = hit._source.events
                    .map((newEvent: MultiversXEvent) => ({ ...newEvent, txHash: hit._id }));

                acc.push(...newEvents);

                return acc;
            }, []);

        await this.updateGasEvents(
            newHits
                .filter((newHit: any) => newHit.address === multiversXNetwork.gasReceiverAddress?.bech32())
        );
        await this.updateCallContractEvents(
            newHits
                .filter((newHit: any) => newHit.address === multiversXNetwork.gatewayAddress?.bech32())
        );

        this.initialHitsLength = count;
    }

    async execute(commands: RelayCommand) {
        await this.executeMultiversXToEvm(commands);
        await this.executeEvmToMultiversX(commands);
    }

    private async executeMultiversXToEvm(commandList: RelayCommand) {
        for (const to of networks) {
            const commands = commandList[to.name];
            if (commands.length == 0) continue;

            const execution = await this.executeEvmGateway(to, commands);
            await this.executeEvmExecutable(to, commands, execution);
        }
    }

    private async executeEvmToMultiversX(commands: RelayCommand) {
        const toExecute = commands['multiversx'];
        if (toExecute?.length === 0) return;

        await this.executeMultiversXGateway(toExecute);
        await this.executeMultiversXExecutable(toExecute);
    }

    private async executeMultiversXGateway(commands: Command[]) {
        if (!multiversXNetwork) return;
        for (const command of commands) {
            await multiversXNetwork.executeGateway(
                command.name,
                command.commandId,
                command.data[0],
                command.data[1],
                command.data[2],
                command.data[3]
            );
        }
    }

    private async executeMultiversXExecutable(commands: Command[]) {
        if (!multiversXNetwork) return;
        for (const command of commands) {
            if (!command.post) continue;

            await command.post({});
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
                this.contractCallGasEvents = this.contractCallGasEvents.filter((_, i) => i !== index);
            }

            try {
                const cost = getGasPrice();
                const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);

                await command.post({
                    gasLimit: BigInt(Math.min(blockLimit, payed.gasFeeAmount / cost))
                });
            } catch (e) {
                logger.log(e);
            }
        }
    }

    private async updateGasEvents(events: MultiversXEvent[]) {
        const newEvents = events.filter(
            (event) => event.identifier === 'payNativeGasForContractCall' || event.identifier === 'payGasForContractCall'
        );

        for (const event of newEvents) {
            const eventName = Buffer.from(event.topics[0], 'base64').toString();
            const sender = new Address(Buffer.from(event.topics[1], 'base64'));
            const destinationChain = Buffer.from(event.topics[2], 'base64').toString();
            const destinationAddress = Buffer.from(event.topics[3], 'base64').toString();

            let payloadHash = '0x', gasFeeAmount = '', refundAddress = '';
            if (eventName === 'native_gas_paid_for_contract_call_event') {
                const decoded = new BinaryCodec().decodeTopLevel(
                    Buffer.from(event.data, 'base64'),
                    new TupleType(new H256Type(), new BigUIntType(), new AddressType())
                ).valueOf();

                // Need to add '0x' in front of hex encoded strings for EVM
                payloadHash = '0x' + (decoded.field0 as H256Value).valueOf().toString('hex');
                gasFeeAmount = (decoded.field1 as BigUIntValue).toString();
                refundAddress = (decoded.field2 as AddressValue).valueOf().bech32();
            } else if (eventName === 'gas_paid_for_contract_call_event') {
                const decoded = new BinaryCodec().decodeTopLevel(
                    Buffer.from(event.data, 'base64'),
                    new TupleType(new H256Type(), new StringType(), new BigUIntType(), new AddressType())
                ).valueOf();

                // Need to add '0x' in front of hex encoded strings for EVM
                payloadHash = '0x' + (decoded.field0 as H256Value).valueOf().toString('hex');
                // Gas token not currently used for MultiversX. Gas value is multiplied by 100_000_000 to be enough for EVM
                // const gasToken = (decoded.field1 as StringValue).valueOf().toString();
                gasFeeAmount = (BigInt((decoded.field2 as BigUIntValue).toString()) * BigInt('100000000')).toString();
                refundAddress = (decoded.field3 as AddressValue).valueOf().bech32();
            }

            const args: NativeGasPaidForContractCallArgs = {
                sourceAddress: sender.bech32(),
                destinationAddress,
                gasFeeAmount,
                destinationChain,
                payloadHash,
                refundAddress,
                gasToken: AddressZero
            };

            this.contractCallGasEvents.push(args);
        }
    }

    private async updateCallContractEvents(events: MultiversXEvent[]) {
        const newEvents = events.filter((event) => event.identifier === 'callContract');

        for (const event of newEvents) {
            const sender = new Address(Buffer.from(event.topics[1], 'base64'));
            const destinationChain = Buffer.from(event.topics[2], 'base64').toString();
            const destinationAddress = Buffer.from(event.topics[3], 'base64').toString();

            const decoded = new BinaryCodec().decodeTopLevel(
                Buffer.from(event.data, 'base64'),
                new TupleType(new H256Type(), new BytesType())
            ).valueOf();
            // Need to add '0x' in front of hex encoded strings for EVM
            const payloadHash = '0x' + (decoded.field0 as H256Value).valueOf().toString('hex');
            const payload = '0x' + (decoded.field1 as BytesValue).valueOf().toString('hex');

            const commandId = getMultiversXLogID('multiversx', sender.bech32(), event.txHash as string, event.order);

            const contractCallArgs: CallContractArgs = {
                from: 'multiversx',
                to: destinationChain,
                sourceAddress: sender.bech32(),
                destinationContractAddress: destinationAddress,
                payload,
                payloadHash,
                transactionHash: event.txHash as string,
                sourceEventIndex: event.order
            };

            this.relayData.callContract[commandId] = contractCallArgs;
            const command = Command.createEVMContractCallCommand(commandId, this.relayData, contractCallArgs);
            this.commands[contractCallArgs.to].push(command);
        }
    }

    createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command {
        if (contractCallArgs.destinationContractAddress === multiversXNetwork.interchainTokenServiceAddress?.bech32()) {
            return MultiversXCommand.createContractCallCommandIts(commandId, relayData, contractCallArgs);
        }

        return MultiversXCommand.createContractCallCommand(commandId, relayData, contractCallArgs);
    }

    createCallContractWithTokenCommand(): Command {
        throw new Error('Method not implemented.');
    }
}
