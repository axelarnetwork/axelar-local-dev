import {
    Command,
    Relayer,
    RelayerType,
    getSignedExecuteInput,
    logger,
    networks,
    type CallContractArgs,
    type CallContractWithTokenArgs,
    type Network,
    type RelayCommand,
    type RelayData,
} from '@axelar-network/axelar-local-dev';
import { approveAndExecute } from '@axelar-network/axelar-cgp-sui';
import type { EventId } from '@mysten/sui/client';
import { arrayify, defaultAbiCoder, hexDataLength, hexZeroPad, hexlify } from 'ethers/lib/utils';

import type { SuiNetwork } from './SuiNetwork';
import { evmMessageId, suiCommandId } from './utils/ids';

const DEFAULT_GAS_LIMIT = BigInt(8e6);
const SUI_CHAIN_NAME = 'sui';

/**
 * ContractCall's fields are not uniformly encoded in parsedJson: `payload`
 * arrives as a byte array while `payload_hash` arrives as a 0x-prefixed hex
 * string. Feeding the string through Uint8Array.from produces a 66-element
 * array of NaN, which then fails hex padding with an unrelated-looking
 * "value out of range" from ethers.
 */
function toHex(value: string | number[]): string {
    return typeof value === 'string' ? value : hexlify(Uint8Array.from(value));
}

export class SuiRelayer extends Relayer {
    /** Paginates queryEvents so a tick never re-reads what it already saw. */
    private cursor: EventId | null = null;
    /** take_approved_message aborts on replay, so a command must run once. */
    private readonly executed = new Set<string>();

    constructor(private readonly sui: SuiNetwork) {
        super();
    }

    setRelayer(type: RelayerType, relayer: Relayer) {
        this.otherRelayers[type] = relayer;
    }

    async updateEvents(): Promise<void> {
        await this.updateCallContractEvents();
    }

    async execute(commands: RelayCommand): Promise<void> {
        await this.executeSuiToEvm(commands);
        await this.executeEvmToSui(commands);
    }

    /**
     * Sui -> EVM.
     *
     * Filter on the exact event struct rather than the module: the events
     * module also emits MessageApproved and MessageExecuted, which our own
     * relay transactions produce, so a module filter would feed the loop its
     * own output.
     */
    private async updateCallContractEvents(): Promise<void> {
        const eventType = `${this.sui.gatewayPackageId}::events::ContractCall`;
        let hasNextPage = true;

        while (hasNextPage) {
            const page = await this.sui.client.queryEvents({
                query: { MoveEventType: eventType },
                cursor: this.cursor,
                order: 'ascending',
                limit: 50,
            });

            for (const event of page.data) {
                this.handleContractCall(event);
            }

            this.cursor = page.nextCursor ?? this.cursor;
            hasNextPage = page.hasNextPage;
        }
    }

    private handleContractCall(event: { id: EventId; parsedJson?: unknown }): void {
        const { source_id, destination_chain, destination_address, payload, payload_hash } = (event.parsedJson ?? {}) as Record<
            string,
            any
        >;

        if (!destination_chain) return;

        const commandId = suiCommandId(event.id);
        const args: CallContractArgs = {
            from: SUI_CHAIN_NAME,
            to: destination_chain,
            sourceAddress: source_id,
            destinationContractAddress: destination_address,
            payload: toHex(payload),
            payloadHash: hexZeroPad(toHex(payload_hash), 32),
            transactionHash: event.id.txDigest,
            sourceEventIndex: Number(event.id.eventSeq),
        };

        // Normalise the destination to the registered network's own spelling.
        // The Sui contract chose this string, and Axelar chain names are
        // conventionally lowercase, but Command.post looks the network up
        // case-sensitively. Fixing it here rather than at execution time is
        // deliberate: Relayer.relay seeds commands[to.name] for every network
        // before updateEvents runs, so a case-insensitive lookup later always
        // finds the seeded empty bucket instead of this one.
        const network = networks.find((candidate) => candidate.name.toLowerCase() === String(destination_chain).toLowerCase());

        args.to = network ? network.name : args.to;

        this.relayData.callContract[commandId] = args;

        // Relayer.relay seeds 'sui', 'wasm' and the registered EVM networks, so
        // a destination we have not seen before has no array yet.
        if (!this.commands[args.to]) this.commands[args.to] = [];

        this.commands[args.to].push(Command.createEVMContractCallCommand(commandId, this.relayData, args));
    }

    private async executeSuiToEvm(commandList: RelayCommand): Promise<void> {
        for (const to of networks) {
            // Exact match is correct: handleContractCall already normalised the
            // key to this network's own spelling.
            const commands = commandList[to.name];

            if (!commands || commands.length === 0) continue;

            const execution = await this.executeEvmGateway(to, commands);
            await this.executeEvmExecutable(to, commands, execution);
        }
    }

    /**
     * EVM -> Sui.
     *
     * Each message is isolated: a Move abort in one must not abandon the rest
     * of the tick. The most likely abort is a replay - the gateway's approval
     * table is permanent, so re-running against a restarted EVM chain that
     * reissues the same transaction hashes hits an already-executed message.
     */
    private async executeEvmToSui(commandList: RelayCommand): Promise<void> {
        const key = Object.keys(commandList).find((name) => name.toLowerCase() === SUI_CHAIN_NAME);
        const toExecute = key ? commandList[key] : undefined;

        if (!toExecute || toExecute.length === 0) return;

        for (const command of toExecute) {
            if (!command.post) continue;

            try {
                await command.post({});
            } catch (error) {
                logger.log(`sui relay failed for command ${command.commandId}: ${error}`);
            }
        }
    }

    createCallContractCommand(commandId: string, relayData: RelayData, args: CallContractArgs): Command {
        // Validation is deferred into post() rather than thrown here. This runs
        // inside EvmRelayer's event loop, before it advances lastRelayedBlock,
        // so throwing would make it re-read the same log forever and wedge all
        // relaying in both directions.
        const invalid = this.destinationError(args);

        if (invalid) {
            // Reported here as well as from post(): the relay loop's catch logs
            // through `logger`, which consumers silence, and this is a caller
            // mistake rather than a transient failure.
            console.error(`sui relay cannot deliver ${commandId}: ${invalid}`);
        }

        // Built lazily for the same reason: evmMessageId throws on incomplete
        // args, and throwing here would wedge the loop just as the destination
        // check would have.
        const buildMessage = () => ({
            source_chain: args.from,
            message_id: evmMessageId(args),
            source_address: args.sourceAddress,
            destination_id: args.destinationContractAddress,
            payload: args.payload,
            payload_hash: args.payloadHash,
        });

        return new Command(
            commandId,
            // Command's constructor keys on this exact name to skip ABI
            // encoding for sui, so it is load-bearing rather than descriptive.
            'approve_contract_call',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.payload],
            [],
            async () => {
                if (invalid) throw new Error(invalid);

                const message = buildMessage();
                const key = `${message.source_chain}:${message.message_id}`;

                // approve_messages is idempotent but take_approved_message
                // aborts on an already-executed message, so a second relay tick
                // over the same command would throw.
                if (this.executed.has(key)) return;

                const result = await approveAndExecute(
                    this.sui.client,
                    this.sui.deployer,
                    this.sui.gatewayInfo,
                    this.sui.discoveryInfo,
                    message,
                    {
                        showEvents: true,
                    },
                );

                this.executed.add(key);
                relayData.callContract[commandId] = { ...relayData.callContract[commandId], execution: result.digest } as any;

                return result;
            },
            SUI_CHAIN_NAME,
        );
    }

    /** The message cannot be delivered; reported when the command runs. */
    private destinationError(args: CallContractArgs): string | undefined {
        if (hexDataLength(args.destinationContractAddress) !== 32) {
            return (
                `a Sui destination must be a 32-byte Channel object id, got ${args.destinationContractAddress}. ` +
                `Send to the destination package's Channel address, not its package id.`
            );
        }

        return undefined;
    }

    createCallContractWithTokenCommand(_commandId: string, _relayData: RelayData, _args: CallContractWithTokenArgs): Command {
        throw new Error('callContractWithToken is not supported on Sui; use createCallContractCommand');
    }

    private async executeEvmGateway(to: Network, commands: Command[]): Promise<any> {
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    to.chainId,
                    commands.map((command) => command.commandId),
                    commands.map((command) => command.name),
                    commands.map((command) => command.encodedData),
                ],
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

            const approved = execution.events.find((event: any) => event.event === 'Executed' && event.args[0] === command.commandId);

            if (!approved) continue;

            try {
                const blockLimit = Number((await to.provider.getBlock('latest')).gasLimit);

                // Not `return` - the deleted cosmos equivalent returns here, so
                // only the first executable command in a batch ever runs.
                await command.post({ gasLimit: BigInt(blockLimit) });
            } catch (error) {
                logger.log(error);
            }
        }
    }
}
