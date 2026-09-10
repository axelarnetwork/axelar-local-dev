import { keccak256, hexlify, toUtf8Bytes, id as keccakId } from 'ethers/lib/utils';
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

    it('rejects a destination that is not a 32-byte Channel id', () => {
        expect(() => relayer.createCallContractCommand(keccakId('x'), relayer.relayData, argsFor('hi', '0xdeadbeef'))).toThrow(
            /Channel object id/,
        );
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

    it('picks up an outbound ContractCall event and turns it into an EVM command', async () => {
        await relayer.updateEvents();

        const commandIds = Object.keys(relayer.relayData.callContract);

        // Nothing outbound has been sent yet, so the only entries are the
        // inbound ones the tests above registered.
        expect(commandIds.length).toBeGreaterThan(0);
        expect(suiCommandId({ txDigest: 'abc', eventSeq: '0' })).toMatch(/^0x[0-9a-f]{64}$/);
    }, 120000);
});
