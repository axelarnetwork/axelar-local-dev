'use strict';

import { ethers } from 'ethers';
const { defaultAbiCoder } = ethers.utils;
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';
import { multiversXNetwork } from './multiversXNetworkUtils';
import createKeccakHash from "keccak";

//An internal class for handling MultiversX commands.
export class Command {
    commandId: string;
    name: string;
    data: any[];
    encodedData: string;
    post: ((options: any) => Promise<any>) | undefined;

    constructor(
        commandId: string,
        name: string,
        data: any[],
        dataSignature: string[],
        post: ((options: any) => Promise<any>) | undefined = undefined,
        chain: string | null = null
    ) {
        this.commandId = commandId;
        this.name = name;
        this.data = data;
        this.encodedData = chain === 'multiversx' && name === 'approveContractCall' ? '' : defaultAbiCoder.encode(dataSignature, data);
        this.post = post;
    }

    static createContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        // Remove 0x added by Ethereum for hex strings
        const properPayloadHex = args.payload.startsWith('0x') ? args.payload.substring(2) : args.payload;

        console.log('Proper payload', properPayloadHex);

        const properPayloadHash = createKeccakHash('keccak256').update(Buffer.from(properPayloadHex, 'hex')).digest('hex');

        console.log('generated payload hash', properPayloadHash);

        return new Command(
            commandId,
            'approveContractCall',
            [args.from, args.sourceAddress, args.destinationContractAddress, properPayloadHash, args.transactionHash, args.sourceEventIndex],
            [],
            async () => {
                const tx = await multiversXNetwork.executeContract(
                    commandId,
                    args.destinationContractAddress,
                    args.from,
                    args.sourceAddress,
                    properPayloadHex,
                );

                relayData.callContract[commandId].execution = tx.getHash();

                return tx;
            },
            'multiversx'
        );
    };
}
