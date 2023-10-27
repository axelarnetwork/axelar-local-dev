export interface CosmosChainInfo {
  owner: {
    mnemonic: string;
    address: string;
  };
  denom?: string;
  rpcUrl?: string;
  lcdUrl?: string;
}

export type ChainConfig = {
  dockerPath: string;
};

export type CosmosChain = "axelar" | "wasm";

export type ChainDenom<T extends CosmosChain> = T extends "axelar"
  ? "uaxl"
  : CosmosChain extends "wasm"
  ? "uwasm"
  : never;
