export const AxelarGMPMessageType = {
  ContractCall: 1,
  ContractCallWithToken: 2,
  TokenTransfer: 3,
} as const;

type GMPMessageType =
  (typeof AxelarGMPMessageType)[keyof typeof AxelarGMPMessageType];

type Bech32Address = string;

export type AxelarGmpIncomingMemo = {
  source_chain: string;
  source_address: string;
  payload: string;
  type: GMPMessageType;
};

type AxelarFeeObject = {
  amount: string;
  recipient: Bech32Address;
};

export type AxelarGmpOutgoingMemo = {
  destination_chain: string;
  destination_address: string;
  payload: number[] | null;
  type: GMPMessageType;
  fee?: AxelarFeeObject;
};

export type ContractCall = {
  target: `0x${string}`;
  functionSignature: string;
  args: unknown[];
};

export type AbiEncodedContractCall = {
  target: `0x${string}`;
  data: `0x${string}`;
};

export const AxelarChains = /** @type {const} */ {
  Ethereum: "Ethereum",
  Avalanche: "Avalanche",
};

export type AxelarChain = keyof typeof AxelarChains;

export type BaseGmpArgs = {
  destinationEVMChain: AxelarChain;
  gasAmount: number; // in ubld
};

export const GmpCallType = {
  ContractCall: 1,
  ContractCallWithToken: 2,
} as const;

export type GmpCallType = (typeof GmpCallType)[keyof typeof GmpCallType];

export type GmpArgsContractCall = BaseGmpArgs & {
  destinationAddress: string;
  type: GmpCallType;
  contractInvocationData: Array<ContractCall>;
};

export type GmpArgsTransferAmount = BaseGmpArgs & {
  transferAmount: bigint;
};

export type GmpArgsWithdrawAmount = BaseGmpArgs & {
  withdrawAmount: bigint;
};
