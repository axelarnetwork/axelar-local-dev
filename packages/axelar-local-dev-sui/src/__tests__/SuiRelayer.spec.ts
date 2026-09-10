import { arrayify, defaultAbiCoder, keccak256, hexlify, toUtf8Bytes, id as keccakId } from 'ethers/lib/utils';
import { TxBuilder } from '@axelar-network/axelar-cgp-sui';
import type { CallContractArgs } from '@axelar-network/axelar-local-dev';

import { SuiNetwork } from '../SuiNetwork';
import { SuiRelayer } from '../SuiRelayer';
import { suiCommandId } from '../utils/ids';

/**
 * Drives the EVM -> Sui half without an EVM chain: the relayer only needs a
 * CallContractArgs, and building one by hand exercises real weighted-signer
 * proof construction, gateway::approve_messages, the relayer-discovery loop
 * and take_approved_message - the entire hard half of the integration, with
 * none of a second runtime's flakiness.
 */
describe('SuiRelayer', () => {
    let sui: SuiNetwork;
    let relayer: SuiRelayer;

    beforeAll(async () => {
        sui = new SuiNetwork();
        await sui.init();
        relayer = new SuiRelayer(sui);
    }, 600000);

    afterAll(async () => {
        await sui?.stop();
    });

    function argsFor(message: string, destination = sui.sample.channelAddress): CallContractArgs {
        const payload = hexlify(toUtf8Bytes(message));

        return {
            from: 'Avalanche',
            to: 'sui',
            sourceAddress: '0x0000000000000000000000000000000000000001',
            destinationContractAddress: destination,
            payload,
            payloadHash: keccak256(payload),
            transactionHash: keccakId(message),
            sourceEventIndex: 0,
        };
    }

    it('rejects a destination that is not a 32-byte Channel id, at execution time', async () => {
        // Deliberately not at construction: that runs inside EvmRelayer's event
        // loop, where a throw would wedge all relaying.
        const command = relayer.createCallContractCommand(keccakId('x'), relayer.relayData, argsFor('hi', '0xdeadbeef'));

        await expect(command.post!({})).rejects.toThrow(/Channel object id/);
    });

    it('refuses callContractWithToken rather than silently doing nothing', () => {
        expect(() => relayer.createCallContractWithTokenCommand('0x0', relayer.relayData, {} as any)).toThrow(/not supported on Sui/);
    });

    it('approves and executes an inbound message end to end', async () => {
        const message = 'hello sui from the relayer spec';
        const commandId = keccakId(message);
        const command = relayer.createCallContractCommand(commandId, relayer.relayData, argsFor(message));

        expect(command.name).toBe('approve_contract_call');
        // The sui/wasm special case in Command skips ABI encoding.
        expect(command.encodedData).toBe('');

        const result: any = await command.post!({});

        const executed = (result.events ?? []).find((event: any) => event.type.endsWith('::gmp::Executed'));

        expect(executed).toBeDefined();
        expect(Buffer.from(executed.parsedJson.payload).toString('utf8')).toBe(message);
    }, 300000);

    it('does not replay an already-executed message', async () => {
        const message = 'executed once only';
        const command = relayer.createCallContractCommand(keccakId(message), relayer.relayData, argsFor(message));

        await command.post!({});

        // take_approved_message aborts on replay, so this must be a no-op
        // rather than a second execution.
        await expect(command.post!({})).resolves.toBeUndefined();
    }, 300000);

    it('turns an outbound ContractCall event into an EVM command', async () => {
        const message = 'hello avalanche from sui';
        const payload = arrayify(defaultAbiCoder.encode(['string'], [message]));
        const destination = '0xd7E33976B03964133D377Ce8f6a3718A212EecAC';

        const builder = new TxBuilder(sui.client);
        // ts-jest resolves @mysten/sui's subpath types differently from tsc, so
        // Transaction comes back without a 2-arg splitCoins. The runtime is fine.
        const [coin] = (builder.tx as any).splitCoins(builder.tx.gas, [1_000_000]);

        await builder.moveCall({
            target: `${sui.sample.packageId}::gmp::send_call`,
            arguments: [
                sui.sample.singletonId,
                sui.gatewayId,
                sui.gasServiceId,
                'Avalanche',
                destination,
                payload,
                sui.getExecutorAddress(),
                coin,
            ] as any,
        });

        const sent: any = await builder.signAndExecute(sui.deployer, { showEvents: true });
        const emitted = sent.events.find((event: any) => event.type.endsWith('::events::ContractCall'));

        expect(emitted).toBeDefined();

        await relayer.updateEvents();

        const commands = relayer['commands']['Avalanche'];

        expect(commands).toHaveLength(1);
        expect(commands[0].commandId).toBe(suiCommandId(emitted.id));

        // Covers the field-encoding trap: payload arrives as a byte array,
        // payload_hash as a hex string.
        const args = relayer.relayData.callContract[commands[0].commandId];

        expect(args.payload).toBe(hexlify(payload));
        expect(args.payloadHash).toBe(keccak256(payload));
        expect(args.destinationContractAddress).toBe(destination);
        expect(args.sourceAddress).toBe(sui.sample.channelAddress);
    }, 300000);
});
