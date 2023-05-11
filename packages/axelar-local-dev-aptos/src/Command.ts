'use strict';

import { ethers } from 'ethers';
const { defaultAbiCoder } = ethers.utils;
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';
import { HexString } from 'aptos';
import { aptosNetwork } from './aptosNetworkUtils';

//An internal class for handling axelar commands.
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
        this.encodedData = chain === 'aptos' && name === 'approve_contract_call' ? '' : defaultAbiCoder.encode(dataSignature, data);
        this.post = post;
    }

    static createAptosContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approve_contract_call',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.payload],
            [],
            async () => {
                const tx = await aptosNetwork.execute(
                    new HexString(commandId).toUint8Array(),
                    args.destinationContractAddress,
                    new HexString(args.payload).toUint8Array()
                );

                relayData.callContract[commandId].execution = tx.hash;
                return tx;
            },
            'aptos'
        );
    };
}
