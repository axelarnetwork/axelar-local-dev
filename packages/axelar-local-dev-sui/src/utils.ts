import { ethers } from 'ethers';
import { EventId } from '@mysten/sui.js/client';
import { BCS, getSuiMoveConfig } from '@mysten/bcs';

export const getCommandId = (event: EventId) => {
    return ethers.utils.id([event.txDigest, event.eventSeq].join(':'));
};

export const getBcsForGateway = () => {
    const bcs = new BCS(getSuiMoveConfig());

    // input argument for the tx
    bcs.registerStructType('Input', {
        data: 'vector<u8>',
        proof: 'vector<u8>',
    });

    bcs.registerStructType('Proof', {
        // operators is a 33 byte / for now at least
        operators: 'vector<vector<u8>>',
        weights: 'vector<u128>',
        threshold: 'u128',
        signatures: 'vector<vector<u8>>',
    });

    // internals of the message
    bcs.registerStructType('AxelarMessage', {
        chain_id: 'u64',
        command_ids: 'vector<address>',
        commands: 'vector<string>',
        params: 'vector<vector<u8>>',
    });

    // internals of the message
    bcs.registerStructType('TransferOperatorshipMessage', {
        operators: 'vector<vector<u8>>',
        weights: 'vector<u128>',
        threshold: 'u128',
    });
    bcs.registerStructType('GenericMessage', {
        source_chain: 'string',
        source_address: 'string',
        target_id: 'address',
        payload_hash: 'vector<u8>',
    });

    return bcs;
};

export const getInputForMessage = (message: Uint8Array) => {
    const bcs = getBcsForGateway();
    const proof = bcs
        .ser('Proof', {
            operators: [],
            weights: [],
            threshold: 0,
            signatures: [],
        })
        .toBytes();

    const input = bcs
        .ser('Input', {
            data: message,
            proof: proof,
        })
        .toBytes();
    return input;
};
