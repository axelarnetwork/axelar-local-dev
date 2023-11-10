'use strict';

import { ethers, Contract, ContractReceipt } from 'ethers';
const { defaultAbiCoder } = ethers.utils;
import { networks } from '../Network';
import { CallContractArgs, CallContractWithTokenArgs, RelayData } from './types';
import { IAxelarExecutable } from '../contracts';

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
        this.encodedData =
            ['sui', 'aptos', 'wasm'].includes(chain || '') && name === 'approve_contract_call'
                ? ''
                : defaultAbiCoder.encode(dataSignature, data);
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
                if (!to) return undefined;

                const contract = new Contract(args.destinationContractAddress, IAxelarExecutable.abi, to.relayerWallet);
                const receipt: ContractReceipt = await contract
                    .execute(commandId, args.from, args.sourceAddress, args.payload, options)
                    .then((tx: any) => tx.wait());
                relayData.callContract[commandId].execution = receipt.transactionHash;
                return receipt;
            },
            'evm'
        );
    };

    static createEVMContractCallWithTokenCommand = (commandId: string, relayData: RelayData, args: CallContractWithTokenArgs) => {
        return new Command(
            commandId,
            'approveContractCallWithMint',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.destinationTokenSymbol, args.amountOut],
            ['string', 'string', 'address', 'bytes32', 'string', 'uint256'],
            async (options: any) => {
                const to = networks.find((chain) => chain.name == args.to);
                if (!to) return;

                const contract = new Contract(args.destinationContractAddress, IAxelarExecutable.abi, to.relayerWallet);
                const receipt = await contract
                    .executeWithToken(
                        commandId,
                        args.from,
                        args.sourceAddress,
                        args.payload,
                        args.destinationTokenSymbol,
                        args.amountOut,
                        options
                    )
                    .then((tx: any) => tx.wait());
                relayData.callContractWithToken[commandId].execution = receipt.transactionHash;
                return receipt;
            },
            'evm'
        );
    };
}
