import fs from "fs";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { CosmosChainInfo } from "../types";
import { getOwnerAccount } from "../docker";

export class CosmosClient {
  chainInfo: Required<CosmosChainInfo>;
  owner: DirectSecp256k1HdWallet;
  public client: SigningCosmWasmClient;
  gasPrice: GasPrice;

  private constructor(
    chainInfo: Required<CosmosChainInfo>,
    owner: DirectSecp256k1HdWallet,
    client: SigningCosmWasmClient,
    gasPrice: GasPrice
  ) {
    this.chainInfo = chainInfo;
    this.owner = owner;
    this.client = client;
    this.gasPrice = gasPrice;
  }

  static async create(config: Omit<CosmosChainInfo, "owner"> = {}) {
    const chainInfo = {
      denom: config.denom || "uwasm",
      lcdUrl: config.lcdUrl || "http://localhost/wasm-lcd",
      rpcUrl: config.rpcUrl || "http://localhost/wasm-rpc",
    };

    const walletOptions = {
      prefix: "wasm",
    };

    const gasPrice = GasPrice.fromString(`1${chainInfo.denom}`);
    const clientOptions = {
      gasPrice,
    };

    const { address, mnemonic } = await getOwnerAccount("wasm");

    const owner = await DirectSecp256k1HdWallet.fromMnemonic(
      mnemonic,
      walletOptions
    );

    const client = await SigningCosmWasmClient.connectWithSigner(
      chainInfo.rpcUrl,
      owner,
      clientOptions
    );

    return new CosmosClient(
      {
        ...chainInfo,
        owner: {
          mnemonic,
          address,
        },
      },
      owner,
      client,
      gasPrice
    );
  }

  getBalance(address: string) {
    return this.client
      .getBalance(address, this.chainInfo.denom)
      .then((res) => res.amount);
  }

  getChainInfo(): Omit<CosmosChainInfo, "owner"> {
    return {
      denom: this.chainInfo.denom,
      lcdUrl: this.chainInfo.lcdUrl,
      rpcUrl: this.chainInfo.rpcUrl,
    };
  }

  async fundWallet(address: string, amount: string) {
    const ownerAddress = await this.getOwnerAccount();

    const gasPrice = GasPrice.fromString(`1${this.chainInfo.denom}`);

    return this.client.sendTokens(
      ownerAddress,
      address,
      [
        {
          amount,
          denom: this.chainInfo.denom,
        },
      ],
      {
        amount: [
          {
            amount: gasPrice.amount.toString(),
            denom: gasPrice.denom,
          },
        ],
        gas: "100000",
      }
    );
  }

  async uploadWasm(path: string) {
    const wasm = fs.readFileSync(path);

    return this.client.upload(
      this.chainInfo.owner.address,
      new Uint8Array(wasm),
      "auto"
    );
  }

  async getOwnerAccount() {
    return this.owner.getAccounts().then((accounts) => accounts[0].address);
  }
}
