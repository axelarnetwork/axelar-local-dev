'use strict';

import { ethers, Wallet, Contract } from 'ethers';
const { defaultAbiCoder, arrayify } = ethers.utils;
import { Network, networks } from '../Network';
import { RelayData } from './relay';
import { CallContractArgs } from './types';
import IAxelarExecutable from '../artifacts/@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarExecutable.sol/IAxelarExecutable.json';

//An internal class for handling axelar commands.
export class Command {
    commandId: string;
    name: string;
    data: any[];
    encodedData: string;
    post: ((options: any) => Promise<void>) | undefined;
    constructor(
        commandId: string,
        name: string,
        data: any[],
        dataSignature: string[],
        post: ((options: any) => Promise<void>) | undefined = undefined
    ) {
        this.commandId = commandId;
        this.name = name;
        this.data = data;
        this.encodedData = defaultAbiCoder.encode(dataSignature, data);
        this.post = post;
    }

    static createContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approveContractCall',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash],
            ['string', 'string', 'address', 'bytes32'],
            async (options: any) => {
                const to = networks.find((chain) => chain.name == args.destinationContractAddress);
                if (!to) return;

                const contract = new Contract(args.destinationContractAddress, IAxelarExecutable.abi, to.relayerWallet);
                const tx = await contract.execute(
                    commandId,
                    args.from,
                    args.sourceAddress,
                    args.payload,
                    options.then((tx: any) => tx.wait())
                );
                relayData.callContract[commandId].execution = tx.transactionHash;
            }
        );
    };
}
