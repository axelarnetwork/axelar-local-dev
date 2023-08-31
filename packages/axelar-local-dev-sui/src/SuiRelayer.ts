import { ethers } from 'ethers';
import { arrayify, defaultAbiCoder } from 'ethers/lib/utils';
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
} from '@axelar-network/axelar-local-dev';
import { Command as SuiCommand } from './Command';
import { SuiNetwork } from './SuiNetwork';
import { getCommandId } from './utils';

export class SuiRelayer extends Relayer {
    private suiNetwork: SuiNetwork;
    private lastQueryMs: number = new Date().getTime();

    constructor(suiNetwork: SuiNetwork) {
        super();
        this.suiNetwork = suiNetwork;
    }

    setRelayer(type: RelayerType, _: Relayer) {
        if (type === 'near' || type === 'aptos') {
            console.log(`${type} not supported yet`);
        }
    }

    // no-op since the events will be listened with event subscription.
    async updateEvents(): Promise<void> {
        // await this.updateGasEvents();
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
        if (!toExecute || toExecute?.length === 0) return;

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

            try {
                const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);
                console.log('Executing command...');
                await command.post({
                    gasLimit: BigInt(blockLimit),
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
        const events = await this.suiNetwork.queryGatewayEvents((this.lastQueryMs + 1).toString());
        this.lastQueryMs = new Date().getTime();

        const decoder = new TextDecoder('utf-8');
        const decode = (msg: number[]) => decoder.decode(new Uint8Array(msg));

        for (const event of events) {
            const commandId = getCommandId(event.id);
            const eventParams = event.parsedJson as any;

            const { destination_address: destinationAddress, destination_chain: destinationChain, payload } = eventParams;

            const payloadHash = ethers.utils.keccak256(decode(payload));

            const contractCallArgs: CallContractArgs = {
                from: 'sui',
                to: decode(destinationChain),
                destinationContractAddress: decode(destinationAddress),
                payload: decode(payload),
                sourceAddress: event.packageId,
                transactionHash: event.id.txDigest,
                payloadHash,
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
