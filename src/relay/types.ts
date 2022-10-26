export interface CallContractArgs {
    from: string;
    to: string;
    sourceAddress: string;
    destinationContractAddress: string;
    payload: string;
    payloadHash: string;
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
