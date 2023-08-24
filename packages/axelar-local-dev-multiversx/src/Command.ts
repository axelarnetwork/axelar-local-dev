'use strict';

import { ethers } from 'ethers';
const { defaultAbiCoder } = ethers.utils;
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';
import { multiversXNetwork } from './multiversXNetworkUtils';

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
        return new Command(
            commandId,
            'approveContractCall',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.transactionHash, args.sourceEventIndex],
            [], // TODO: Setup proper signature
            async () => {
                // const tx = await multiversXNetwork.execute(
                //     new HexString(commandId).toUint8Array(),
                //     args.destinationContractAddress,
                //     new HexString(args.payload).toUint8Array()
                // );
                //
                // relayData.callContract[commandId].execution = tx.hash;
                // return tx;
            },
            'multiversx'
        );
    };
}
