'use strict';

import { ethers } from 'ethers';
import { CallContractArgs, RelayData } from '@axelar-network/axelar-local-dev';
import { nearNetwork } from '..';

const { defaultAbiCoder } = ethers.utils;

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
        this.encodedData = chain === 'aptos' && name === 'approve_contract_call' ? '' : defaultAbiCoder.encode(dataSignature, data);
        this.post = post;
    }

    static createCallContractCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approveContractCall',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.transactionHash, args.sourceEventIndex],
            ['string', 'string', 'string', 'bytes32', 'bytes32', 'uint256'],
            async () => {
                const tx = await nearNetwork.executeRemote(
                    commandId,
                    args.destinationContractAddress,
                    args.from,
                    args.sourceAddress,
                    args.payload,
                );

                relayData.callContract[commandId].execution = tx.transactionReceipt.hash;

                return tx;
            },
            'near',
        );
    };
}
