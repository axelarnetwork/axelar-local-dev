import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import { CosmosChainInfo } from "./types";

export class CosmosClient {
  chainInfo: CosmosChainInfo;
  owner: DirectSecp256k1HdWallet | undefined;

  constructor(chainInfo: CosmosChainInfo) {
    this.chainInfo = chainInfo;
  }

  async init() {
    this.owner = await DirectSecp256k1HdWallet.fromMnemonic(
      this.chainInfo.owner.mnemonic
    );
  }
}
