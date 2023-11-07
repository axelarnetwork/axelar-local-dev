import { Height } from "cosmjs-types/ibc/core/client/v1/client";
import { Coin } from "@cosmjs/stargate";

export interface CosmosChainInfo {
  owner: {
    mnemonic: string;
    address: string;
  };
  prefix: string;
  denom?: string;
  rpcUrl?: string;
  lcdUrl?: string;
  wsUrl?: string;
}

export type ChainConfig = {
  dockerPath: string;
  onCompleted: (chainInfo: CosmosChainInfo) => void;
};

export type CosmosChain = "axelar" | "wasm";

export type ChainDenom<T extends CosmosChain> = T extends "axelar"
  ? "uaxl"
  : CosmosChain extends "wasm"
  ? "uwasm"
  : never;

export interface AxelarListenerEvent<T> {
  type: string;
  topicId: string;
  parseEvent: (event: any) => Promise<T>;
}

export interface ContractCallSubmitted {
  messageId: string;
  sender: string;
  sourceChain: string;
  destinationChain: string;
  contractAddress: string;
  payload: string;
  payloadHash: string;
}

export interface ContractCallWithTokenSubmitted {
  messageId: string;
  sender: string;
  sourceChain: string;
  destinationChain: string;
  contractAddress: string;
  payload: string;
  payloadHash: string;
  symbol: string;
  amount: string;
}

export interface MsgTransfer {
  /** the port on which the packet will be sent */
  sourcePort: string;
  /** the channel by which the packet will be sent */

  sourceChannel: string;
  /** the tokens to be transferred */

  token?: Coin;
  /** the sender address */

  sender: string;
  /** the recipient address on the destination chain */

  receiver: string;
  /**
   * Timeout height relative to the current block height.
   * The timeout is disabled when set to 0.
   */

  timeoutHeight?: Height;
  /**
   * Timeout timestamp in absolute nanoseconds since unix epoch.
   * The timeout is disabled when set to 0.
   */

  timeoutTimestamp: Long;

  memo: string;
}

export interface IBCEvent<T> {
  hash: string;
  srcChannel?: string;
  destChannel?: string;
  args: T;
}
