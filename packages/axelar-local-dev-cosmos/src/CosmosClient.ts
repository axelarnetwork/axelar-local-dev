import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import { CosmosChainInfo } from "./types";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";

export class CosmosClient {
  chainInfo: CosmosChainInfo;
  owner: DirectSecp256k1HdWallet | undefined;
  client: SigningCosmWasmClient | undefined;

  constructor(chainInfo: CosmosChainInfo) {
    this.chainInfo = chainInfo;
  }

  async init() {
    this.owner = await DirectSecp256k1HdWallet.fromMnemonic(
      this.chainInfo.owner.mnemonic,
      {
        prefix: "wasm",
      }
    );

    this.client = await SigningCosmWasmClient.connectWithSigner(
      this.chainInfo.rpcUrl,
      this.owner
    );
  }

  getBalance(address: string) {
    return this.client
      ?.getBalance(address, this.chainInfo.denom)
      .then((res) => res.amount);
  }

  async getOwnerBalance() {
    if (!this.owner) {
      throw new Error(
        "The init method must be called before calling this method"
      );
    }

    const addresses = await this.owner
      .getAccounts()
      .then((accounts) => accounts.map((account) => account.address));

    return this.getBalance(addresses[0]);
  }
}
