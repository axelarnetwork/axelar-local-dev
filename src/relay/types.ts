import { Command } from './Command';

export interface CallContractArgs {
    from: string;
    to: string;
    sourceAddress: string;
    destinationContractAddress: string;
    payload: string;
    payloadHash: string;
    transactionHash: string;
    sourceEventIndex: number;
}

export interface CallContractWithTokenArgs {
    from: string;
    to: string;
    sourceAddress: string;
    destinationContractAddress: string;
    payload: string;
    payloadHash: string;
    alias: string;
    destinationTokenSymbol: string;
    amountIn: string;
    amountOut: string;
}

export interface NativeGasPaidForContractCallArgs {
    sourceAddress: string;
    destinationChain: string;
    destinationAddress: string;
    payloadHash: string;
    gasFeeAmount: string;
    refundAddress: string;
    gasToken: string;
}

export interface RelayData {
    depositAddress: any;
    sendToken: any;
    callContract: any;
    callContractWithToken: any;
}

export type RelayCommand = { [key: string]: Command[] };
