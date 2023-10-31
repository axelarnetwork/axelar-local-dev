import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { IbcClient, Link, RelayedHeights } from "@confio/relayer";
import { ChannelPair } from "@confio/relayer/build/lib/link";
import { CosmosClient } from "../clients/CosmosClient";
import { relay } from "@axelar-network/axelar-local-dev";
import { convertCosmosAddress } from "../docker";

export class IBCRelayerClient {
  axelarClient: CosmosClient;
  wasmClient: CosmosClient;
  link?: Link;
  public channel?: ChannelPair;
  public lastRelayedHeight: RelayedHeights = {};
  public relayerAccount: DirectSecp256k1HdWallet;

  private constructor(
    axelarClient: CosmosClient,
    wasmClient: CosmosClient,
    relayer: DirectSecp256k1HdWallet
  ) {
    this.axelarClient = axelarClient;
    this.wasmClient = wasmClient;
    this.relayerAccount = relayer;
  }

  static async create() {
    const axelarClient = await CosmosClient.create("axelar");
    const wasmClient = await CosmosClient.create("wasm");
    const relayer = await DirectSecp256k1HdWallet.generate(12, {
      prefix: "wasm",
    });

    // Fund the relayer address
    const relayerAddress = await relayer
      .getAccounts()
      .then((accounts) => accounts[0].address);
    const relayerAxelarAddress = convertCosmosAddress(relayerAddress, "axelar");

    await wasmClient.fundWallet(relayerAddress, "100000000");
    console.log("Funded relayer address on wasm:", relayerAddress);
    await axelarClient.fundWallet(relayerAxelarAddress, "100000000");
    console.log("Funded relayer address on axelar:", relayerAxelarAddress);

    // check the fund
    const balance = await wasmClient.getBalance(relayerAddress);
    console.log("Relayer wasm balance", balance);
    const axelarBalance = await axelarClient.getBalance(relayerAxelarAddress);
    console.log("Relayer axelar balance", axelarBalance);

    return new IBCRelayerClient(axelarClient, wasmClient, relayer);
  }

  getRelayerAddress() {
    return this.relayerAccount
      .getAccounts()
      .then((accounts) => accounts[0].address);
  }

  async getIBCClient(client: CosmosClient) {
    const relayerAddress = await this.getRelayerAddress();
    const prefix = client.getChainInfo().prefix;
    const relayer = await DirectSecp256k1HdWallet.fromMnemonic(
      this.relayerAccount.mnemonic,
      {
        prefix,
      }
    );

    return IbcClient.connectWithSigner(
      client.chainInfo.rpcUrl,
      relayer,
      convertCosmosAddress(relayerAddress, prefix),
      {
        gasPrice: client.gasPrice,
        estimatedBlockTime: 400,
        estimatedIndexerTime: 60,
      }
    );
  }

  async initConnection() {
    const axelarIBCClient = await this.getIBCClient(this.axelarClient);
    const wasmIBCClient = await this.getIBCClient(this.wasmClient);

    if (this.link)
      return {
        axelar: {
          connectionId: this.link.endA.connectionID,
        },
        wasm: {
          connectionId: this.link.endB.connectionID,
        },
      };

    this.link = await Link.createWithNewConnections(
      axelarIBCClient,
      wasmIBCClient
    );

    return {
      axelar: {
        connectionId: this.link.endA.connectionID,
      },
      wasm: {
        connectionId: this.link.endB.connectionID,
      },
    };
  }

  async createChannel(sender: "A" | "B") {
    if (!this.link) {
      throw new Error("Link not initialized");
    }

    if (this.channel) return this.channel;

    this.channel = await this.link?.createChannel(
      sender,
      "transfer",
      "transfer",
      Order.ORDER_UNORDERED,
      "ics20-1"
    );

    return this.channel;
  }

  async relayPackets() {
    if (!this.link) {
      throw new Error("Link not initialized");
    }

    this.lastRelayedHeight = await this.link!.checkAndRelayPacketsAndAcks(
      this.lastRelayedHeight,
      2,
      6
    );

    return this.lastRelayedHeight;
  }
}
