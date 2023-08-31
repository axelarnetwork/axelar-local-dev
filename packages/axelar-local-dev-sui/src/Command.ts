'use strict';

import { ethers } from 'ethers';
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';
import { SuiNetwork } from './SuiNetwork';
import { TransactionBlock } from '@mysten/sui.js/transactions';

const { defaultAbiCoder } = ethers.utils;
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

    static createContractCallCommand = (commandId: string, suiNetwork: SuiNetwork, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approve_contract_call',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.payload],
            [],
            async () => {
                const tx = new TransactionBlock();
                tx.moveCall({
                    target: `${args.destinationContractAddress}::execute` as any,
                    arguments: [tx.pure(commandId), tx.pure(args.from), tx.pure(args.sourceAddress), tx.pure(args.payload.slice(2))],
                });
                return suiNetwork.execute(tx);
            },
            'sui',
        );
    };
}
