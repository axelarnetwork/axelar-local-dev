'use strict';

import { ethers, Contract, BigNumber, ContractReceipt } from 'ethers';
const { defaultAbiCoder } = ethers.utils;
import { networks } from '../Network';
import { CallContractArgs, CallContractWithTokenArgs, RelayData } from './types';
import { IAxelarExecutable } from '../contracts';
import { aptosNetwork } from '../aptos';
import { HexString } from 'aptos';
import { nearNetwork } from '../near';

//An internal class for handling axelar commands.
export class Command {
    commandId: string;
    name: string;
    data: any[];
    encodedData: string;
    to: string;
    post: ((options: any) => Promise<any>) | undefined;
    estimateGas: (() => Promise<BigNumber | undefined>) | undefined;

    constructor(
        commandId: string,
        name: string,
        data: any[],
        dataSignature: string[],
        to: string,
        post: ((options: any) => Promise<any>) | undefined = undefined,
        chain: string | null = null,
        estimateGas: () => Promise<BigNumber | undefined> = async () => undefined
    ) {
        this.commandId = commandId;
        this.name = name;
        this.data = data;
        this.encodedData = chain === 'aptos' && name === 'approve_contract_call' ? '' : defaultAbiCoder.encode(dataSignature, data);
        this.to = to;
        this.post = post;
        this.estimateGas = estimateGas;
    }

    static createEVMContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approveContractCall',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash],
            ['string', 'string', 'address', 'bytes32'],
            args.to,
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
            'evm',
            async () => {
                const to = networks.find((chain) => chain.name == args.to);
                if (!to) return;

                const contract = new Contract(args.destinationContractAddress, IAxelarExecutable.abi, to.relayerWallet);
                return contract.estimateGas.execute(commandId, args.from, args.sourceAddress, args.payload).catch(() => undefined);
            }
        );
    };

    static createEVMContractCallWithTokenCommand = (commandId: string, relayData: RelayData, args: CallContractWithTokenArgs) => {
        return new Command(
            commandId,
            'approveContractCallWithMint',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.destinationTokenSymbol, args.amountOut],
            ['string', 'string', 'address', 'bytes32', 'string', 'uint256'],
            args.to,
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
            'evm',
            async () => {
                const to = networks.find((chain) => chain.name == args.to);
                if (!to) return;

                const contract = new Contract(args.destinationContractAddress, IAxelarExecutable.abi, to.relayerWallet);
                return contract.estimateGas
                    .executeWithToken(commandId, args.from, args.sourceAddress, args.payload, args.destinationTokenSymbol, args.amountOut)
                    .catch(() => undefined);
            }
        );
    };

    static createAptosContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approve_contract_call',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.payload],
            [],
            args.to,
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

    static createNearContractCallCommand = (commandId: string, relayData: RelayData, args: CallContractArgs) => {
        return new Command(
            commandId,
            'approveContractCall',
            [args.from, args.sourceAddress, args.destinationContractAddress, args.payloadHash, args.transactionHash, args.sourceEventIndex],
            ['string', 'string', 'string', 'bytes32', 'bytes32', 'uint256'],
            args.to,
            async () => {
                const tx = await nearNetwork.executeRemote(
                    commandId,
                    args.destinationContractAddress,
                    args.from,
                    args.sourceAddress,
                    args.payload
                );

                relayData.callContract[commandId].execution = tx.transactionReceipt.hash;

                return tx;
            },
            'near'
        );
    };
}
