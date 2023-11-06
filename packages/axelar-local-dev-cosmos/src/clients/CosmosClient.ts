import fs from "fs";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, StargateClient } from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { sha256 } from "@cosmjs/crypto";
import crypto from "crypto";
import { CosmosChain, CosmosChainInfo } from "../types";
import { getOwnerAccount } from "../docker";
import Long from "long";

export class CosmosClient {
  public chainInfo: Required<CosmosChainInfo>;
  public owner: DirectSecp256k1HdWallet;
  public client: SigningCosmWasmClient;
  stargateClient: StargateClient;
  public gasPrice: GasPrice;

  private constructor(
    chainInfo: Required<CosmosChainInfo>,
    owner: DirectSecp256k1HdWallet,
    client: SigningCosmWasmClient,
    gasPrice: GasPrice,
    starGateClient: StargateClient
  ) {
    this.chainInfo = chainInfo;
    this.owner = owner;
    this.client = client;
    this.gasPrice = gasPrice;
    this.stargateClient = starGateClient;
  }

  static async create(
    chain: CosmosChain = "wasm",
    config: Omit<CosmosChainInfo, "owner"> = { prefix: chain }
  ) {
    const defaultDenom = chain === "wasm" ? "uwasm" : "uaxl";
    const chainInfo = {
      denom: config.denom || defaultDenom,
      lcdUrl: config.lcdUrl || `http://localhost/${chain}-lcd`,
      rpcUrl: config.rpcUrl || `http://localhost/${chain}-rpc`,
      wsUrl: config.wsUrl || `ws://localhost/${chain}-rpc/websocket`,
    };

    const walletOptions = {
      prefix: chain,
    };

    const gasPrice = GasPrice.fromString(`1${chainInfo.denom}`);
    const clientOptions = {
      gasPrice,
    };

    const { address, mnemonic } = await getOwnerAccount(chain);

    const owner = await DirectSecp256k1HdWallet.fromMnemonic(
      mnemonic,
      walletOptions
    );

    const client = await SigningCosmWasmClient.connectWithSigner(
      chainInfo.rpcUrl,
      owner,
      clientOptions
    );

    const stargateClient = await StargateClient.connect(chainInfo.rpcUrl);

    return new CosmosClient(
      {
        ...chainInfo,
        owner: {
          mnemonic,
          address,
        },
        prefix: chain,
      },
      owner,
      client,
      gasPrice,
      stargateClient
    );
  }

  getBalance(address: string, denom?: string) {
    return this.client
      .getBalance(address, denom || this.chainInfo.denom)
      .then((res) => res.amount);
  }

  async getBalances(address: string) {
    return this.stargateClient.getAllBalances(address);
  }

  getChainInfo(): Omit<CosmosChainInfo, "owner"> {
    return {
      prefix: this.chainInfo.prefix,
      denom: this.chainInfo.denom,
      lcdUrl: this.chainInfo.lcdUrl,
      rpcUrl: this.chainInfo.rpcUrl,
      wsUrl: this.chainInfo.wsUrl,
    };
  }

  async ibcTransfer(
    sender: string,
    receiver: string,
    sourceChannel: string,
    amount: string
  ) {
    const msgIBCTransfer = {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel,
        token: {
          denom: this.chainInfo.denom,
          amount: amount,
        },
        sender: sender,
        receiver: receiver,
        timeoutTimestamp: Long.fromNumber(Date.now() + 600_000).multiply(
          1_000_000
        ),
      },
    };

    return this.client.signAndBroadcast(
      sender,
      [msgIBCTransfer],
      "auto",
      "IBC Transfer"
    );
  }

  getIBCDenom(channel: string, denom: string, port = "transfer") {
    const path = `${port}/${channel}/${denom}`;
    // Compute the SHA-256 hash of the path
    const hash = crypto.createHash("sha256").update(path).digest();

    // Convert the hash to a hexadecimal representation
    const hexHash = hash.toString("hex").toUpperCase();

    // Construct the denom by prefixing the hex hash with 'ibc/'
    return `ibc/${hexHash}`;
  }

  async fundWallet(address: string, amount: string) {
    const ownerAddress = await this.getOwnerAccount();

    const gasPrice = GasPrice.fromString(`1${this.chainInfo.denom}`);

    return this.client
      .sendTokens(
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
      )
      .then((res) => {
        if (res.code !== 0) {
          throw new Error(res.rawLog);
        }
        return res;
      });
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
