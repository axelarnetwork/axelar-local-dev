import { evmMessageId, suiCommandId, suiMessageId } from '../utils/ids';

describe('message id bridge', () => {
    const eventId = { txDigest: '9vp3oHFmDaRWHV2qEqrnPMQaFg5LgQqB41TtRF5txfWs', eventSeq: '0' };

    it('derives a Sui message id from the emitting event', () => {
        expect(suiMessageId(eventId)).toBe('9vp3oHFmDaRWHV2qEqrnPMQaFg5LgQqB41TtRF5txfWs-0');
    });

    it('derives a stable bytes32 commandId for the EVM side', () => {
        const commandId = suiCommandId(eventId);

        expect(commandId).toMatch(/^0x[0-9a-f]{64}$/);
        expect(commandId).toBe(suiCommandId(eventId));
        expect(commandId).not.toBe(suiCommandId({ ...eventId, eventSeq: '1' }));
    });

    it('derives the canonical EVM message id', () => {
        expect(evmMessageId({ transactionHash: '0xabc', sourceEventIndex: 3 })).toBe('0xabc-3');
    });

    it('refuses to guess when the source event fields are missing', () => {
        expect(() => evmMessageId({ transactionHash: '0xabc' } as any)).toThrow(/sourceEventIndex/);
    });
});
