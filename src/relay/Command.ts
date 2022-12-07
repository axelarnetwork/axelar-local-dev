'use strict';

import { ethers, Contract } from 'ethers';
const { defaultAbiCoder } = ethers.utils;
import { networks } from '../Network';
import { CallContractArgs, RelayData } from './types';
import IAxelarExecutable from '../artifacts/@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarExecutable.sol/IAxelarExecutable.json';
import { aptosNetwork } from '../aptos';
import { HexString } from 'aptos';

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
        this.encodedData = name === 'approve_contract_call' ? '' : defaultAbiCoder.encode(dataSignature, data);
        this.post = post;
    }

    static createEVMContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approveContractCall',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash],
            ['string', 'string', 'address', 'bytes32'],
            async (options: any) => {
                const to = networks.find((chain) => chain.name == args.to);
                if (!to) return;

                const contract = new Contract(args.destinationContractAddress, IAxelarExecutable.abi, to.relayerWallet);
                const tx = await contract
                    .execute(commandId, args.from, args.sourceAddress, args.payload, options)
                    .then((tx: any) => tx.wait());
                relayData.callContract[commandId].execution = tx.transactionHash;
            }
        );
    };

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
                    new HexString(args.payload).toUint8Array(),
                );

                relayData.callContract[commandId].execution = tx.hash;
            }
        );
    };
}
