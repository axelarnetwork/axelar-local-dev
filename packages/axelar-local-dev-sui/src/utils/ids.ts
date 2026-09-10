import { id as keccakId } from 'ethers/lib/utils';
import type { CallContractArgs } from '@axelar-network/axelar-local-dev';

/**
 * Message identity differs across the two gateways, and the mapping is a pure
 * function in both directions rather than a lookup table.
 *
 * The EVM gateway keys an approval by an opaque bytes32 commandId. The Sui
 * gateway keys by (source_chain, message_id) and its take_approved_message
 * takes no commandId at all.
 */

/** Sui's native message identity: the emitting event's id. */
export function suiMessageId(eventId: { txDigest: string; eventSeq: string | number }): string {
    return `${eventId.txDigest}-${eventId.eventSeq}`;
}

/**
 * Sui -> EVM. The EVM side only ever compares this against its own approval
 * table, so a one-way hash is sufficient and nothing needs the string back.
 */
export function suiCommandId(eventId: { txDigest: string; eventSeq: string | number }): string {
    return keccakId(`sui:${suiMessageId(eventId)}`);
}

/**
 * EVM -> Sui. `${transactionHash}-${sourceEventIndex}` is Axelar's canonical
 * EVM message id, so a locally relayed message carries the same identity it
 * would on testnet. Both fields are populated by EvmRelayer before the command
 * is created, which is why this needs no shared state.
 */
export function evmMessageId(args: Pick<CallContractArgs, 'transactionHash' | 'sourceEventIndex'>): string {
    if (!args.transactionHash || args.sourceEventIndex === undefined || args.sourceEventIndex === null) {
        throw new Error(
            'cannot derive a Sui message id: CallContractArgs is missing transactionHash or sourceEventIndex. ' +
                'These are populated by EvmRelayer.updateCallContractEvents; a hand-built args object must set them too.',
        );
    }

    return `${args.transactionHash}-${args.sourceEventIndex}`;
}
