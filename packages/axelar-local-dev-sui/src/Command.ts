'use strict';

import { ethers } from 'ethers';
const { defaultAbiCoder } = ethers.utils;
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';

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
        chain: string | null = null,
    ) {
        this.commandId = commandId;
        this.name = name;
        this.data = data;
        this.encodedData = chain === 'sui' && name === 'approve_contract_call' ? '' : defaultAbiCoder.encode(dataSignature, data);
        this.post = post;
    }

    static createContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approve_contract_call',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.payload],
            [],
            async () => {
                // TODO: execute the transaction on destination module
            },
            'sui',
        );
    };
}
