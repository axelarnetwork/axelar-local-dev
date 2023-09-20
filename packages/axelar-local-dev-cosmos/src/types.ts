export interface StartOptions {
  cleanStart?: boolean;
  chain?: CosmosChainOptions;
}

export interface CosmosChainOptions {
  name: string;
  port: number;
}
