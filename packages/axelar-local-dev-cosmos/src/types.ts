import { IDockerComposeOptions } from "docker-compose/dist/v2";

export interface StartOptions {
  cleanStart?: boolean;
  chain?: CosmosChainOptions;
  dockerComposeOptions?: IDockerComposeOptions;
}

export interface CosmosChainInfo {
  owner: {
    mnemonic: string;
    address: string;
  };
  denom: string;
  rpcUrl: string;
  lcdUrl: string;
}

export interface CosmosChainOptions {
  name: string;
  port: number;
  rpcPort: number;
}
