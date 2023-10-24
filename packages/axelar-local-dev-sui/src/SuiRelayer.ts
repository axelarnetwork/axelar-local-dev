import { arrayify, defaultAbiCoder, hexlify, keccak256 } from 'ethers/lib/utils';
import {
    logger,
    getSignedExecuteInput,
    RelayCommand,
    Network,
    networks,
    Command,
    Relayer,
    RelayerType,
    CallContractArgs,
    RelayData,
    getRandomID,
} from '@axelar-network/axelar-local-dev';
import { Command as SuiCommand } from './Command';
import { SuiNetwork } from './SuiNetwork';
import { getBcsForGateway, getCommandId, getInputForMessage } from './utils';
import { TransactionBlock } from '@mysten/sui.js/transactions';

const DEFAULT_GAS_LIMIT = BigInt(8e6);

export class SuiRelayer extends Relayer {
    private suiNetwork: SuiNetwork;
    private lastQueryMs: number = new Date().getTime();
    private textDecoder = new TextDecoder('utf-8');

    constructor(suiNetwork: SuiNetwork) {
        super();
        this.suiNetwork = suiNetwork;
    }

    setRelayer(type: RelayerType, relayer: Relayer) {
        if (type === 'near' || type === 'aptos') {
            return console.log(`${type} not supported yet`);
        }

        this.otherRelayers[type] = relayer;
    }

    // no-op since the events will be listened with event subscription.
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
            if (commands.length === 0) continue;

            const execution = await this.executeEvmGateway(to, commands);
            await this.executeEvmExecutable(to, commands, execution);
        }
    }

    private async executeEvmToSui(commands: RelayCommand) {
        const toExecute = commands['sui'];
        if (!toExecute || toExecute?.length === 0) return;

        await this.executeSuiGateway(toExecute);
        await this.executeSuiExecutable(toExecute);
    }

    private approveContractCallInput(
        sourceChain: string,
        sourceAddress: string,
        destinationAddress: string,
        payloadHash: string,
        commandId = getRandomID(),
    ) {
        const bcs = getBcsForGateway();
        const params = bcs
            .ser('GenericMessage', {
                source_chain: sourceChain,
                source_address: sourceAddress,
                payload_hash: payloadHash,
                target_id: destinationAddress,
            })
            .toBytes();
        const message = bcs
            .ser('AxelarMessage', {
                chain_id: 1,
                command_ids: [commandId],
                commands: ['approveContractCall'],
                params: [params],
            })
            .toBytes();

        return getInputForMessage(message);
    }

    private async executeSuiGateway(commands: Command[]) {
        for (const command of commands) {
            const input = this.approveContractCallInput(
                command.data[0],
                command.data[1],
                command.data[2],
                command.data[3],
                command.commandId,
            );

            const packageId = this.suiNetwork.axelarPackageId;
            const validators = this.suiNetwork.axelarValidators;

            const tx = new TransactionBlock();
            tx.moveCall({
                target: `${packageId}::gateway::process_commands`,
                arguments: [tx.object(validators), tx.pure(String.fromCharCode(...input))],
                typeArguments: [],
            });
            await this.suiNetwork.execute(tx);
        }
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
            .execute(signedData, { gasLimit: DEFAULT_GAS_LIMIT })
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

            try {
                const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);
                await command.post({
                    gasLimit: BigInt(blockLimit),
                });
            } catch (e) {
                logger.log(e);
            }
        }
    }

    // TODO: Implement querying gas events in the future when we integrate with the gas module.
    private async updateGasEvents() {}

    private convertUint8ArrayToUtf8String(uint8Array: number[]) {
        return this.textDecoder.decode(new Uint8Array(uint8Array));
    }

    private async updateCallContractEvents() {
        const events = await this.suiNetwork.queryGatewayEvents((this.lastQueryMs + 1).toString());
        this.lastQueryMs = new Date().getTime();

        for (const event of events) {
            const commandId = getCommandId(event.id);
            const eventParams = event.parsedJson as any;

            const {
                destination_address: destinationAddress,
                destination_chain: destinationChain,
                payload,
                payload_hash,
                source_id,
            } = eventParams;

            const contractCallArgs: CallContractArgs = {
                from: 'sui',
                to: destinationChain,
                destinationContractAddress: destinationAddress,
                payload: hexlify(payload),
                sourceAddress: source_id,
                transactionHash: event.id.txDigest,
                payloadHash: payload_hash,
                sourceEventIndex: parseInt(event.id.eventSeq),
            };

            this.relayData.callContract[commandId] = contractCallArgs;
            const command = Command.createEVMContractCallCommand(commandId, this.relayData, contractCallArgs);
            this.commands[contractCallArgs.to].push(command);
        }
    }

    createCallContractCommand(commandId: string, relayData: RelayData, contractCallArgs: CallContractArgs): Command {
        return SuiCommand.createContractCallCommand(commandId, this.suiNetwork, relayData, contractCallArgs);
    }

    createCallContractWithTokenCommand(): Command {
        throw new Error('Method not implemented.');
    }
}
