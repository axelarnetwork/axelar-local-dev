import { ethers } from 'ethers';
import { EventId } from '@mysten/sui.js/client';
import { BCS, getSuiMoveConfig } from '@mysten/bcs';
import { TransactionBlock } from '@mysten/sui.js';

const {
    utils: { hexlify, arrayify },
} = ethers;

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
        payload_hash: 'address',
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

export const getMoveCallFromTx = (tx: TransactionBlock, txData: any, payload: string, callContractObj: any = null) => {
    const bcs = new BCS(getSuiMoveConfig());

    // input argument for the tx
    bcs.registerStructType('Description', {
        packageId: 'address',
        module_name: 'string',
        name: 'string',
    });
    bcs.registerStructType('Transaction', {
        function: 'Description',
        arguments: 'vector<vector<u8>>',
        type_arguments: 'vector<Description>',
    });
    let txInfo = bcs.de('Transaction', new Uint8Array(txData));
    const decodeArgs = (args: Uint8Array[]) =>
        args.map((arg) => {
            if (arg[0] === 0) {
                return tx.object(hexlify(arg.slice(1)));
            } else if (arg[0] === 1) {
                return tx.pure(arg.slice(1));
            } else if (arg[0] === 2) {
                return callContractObj;
            } else if (arg[0] === 3) {
                return tx.pure(String.fromCharCode(...arrayify(payload)));
            } else {
                throw new Error(`Invalid argument prefix: ${arg[0]}`);
            }
        });
    const decodeDescription = (description: any) => `${description.packageId}::${description.module_name}::${description.name}`;

    return {
        target: decodeDescription(txInfo.function),
        arguments: decodeArgs(txInfo.arguments),
        typeArguments: txInfo.type_arguments.map(decodeDescription),
    } as any;
};
