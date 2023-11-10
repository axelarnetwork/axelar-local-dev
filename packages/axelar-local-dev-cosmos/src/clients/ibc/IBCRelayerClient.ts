import path from "path";
import fs from "fs";
import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { IbcClient, Link, RelayedHeights } from "@confio/relayer";
import { ChannelPair } from "@confio/relayer/build/lib/link";
import { CosmosClient } from "../cosmos/CosmosClient";
import { convertCosmosAddress } from "../../docker";
import { RelayerAccountManager } from ".";
import { readFileSync } from "../../utils";

export class IBCRelayerClient {
  axelarClient: CosmosClient;
  wasmClient: CosmosClient;
  link?: Link;
  public channel?: ChannelPair;
  public lastRelayedHeight: RelayedHeights = {};
  public relayerAccountManager: RelayerAccountManager;

  private constructor(
    axelarClient: CosmosClient,
    wasmClient: CosmosClient,
    relayer: DirectSecp256k1HdWallet
  ) {
    this.axelarClient = axelarClient;
    this.wasmClient = wasmClient;
    this.relayerAccountManager = new RelayerAccountManager(
      this.axelarClient,
      this.wasmClient,
      relayer
    );
  }

  static async create(mnemonic?: string) {
    const axelarClient = await CosmosClient.create("axelar");
    const wasmClient = await CosmosClient.create("wasm");
    const relayer = await RelayerAccountManager.createRelayerAccount(
      "wasm",
      mnemonic
    );

    return new IBCRelayerClient(axelarClient, wasmClient, relayer);
  }

  async getIBCClient(client: CosmosClient) {
    const relayerAddress = await this.relayerAccountManager.getRelayerAddress();
    const prefix = client.getChainInfo().prefix;
    const relayer = await DirectSecp256k1HdWallet.fromMnemonic(
      this.relayerAccountManager.relayerAccount.mnemonic,
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

  getRelayerAccountManager() {
    return this.relayerAccountManager;
  }

  getCurrentConnection() {
    try {
      const json = readFileSync(
        path.join(__dirname, "../../../info/connection.json"),
        "utf8"
      );
      return JSON.parse(json);
    } catch (e) {
      return undefined;
    }
  }

  getCurrentChannel(): ChannelPair | undefined {
    try {
      const json = fs.readFileSync(
        path.join(__dirname, "../../../info/channel.json"),
        "utf8"
      );
      return JSON.parse(json);
    } catch (e) {
      return undefined;
    }
  }

  async initConnection(saveToFile = false) {
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

    const connection = await this.getCurrentConnection();

    if (connection) {
      // console.log("Using existing connection", connection);
      this.link = await Link.createWithExistingConnections(
        axelarIBCClient,
        wasmIBCClient,
        connection.axelar.connectionId,
        connection.wasm.connectionId
      );
    } else {
      // console.log("Creating new connection");
      this.link = await Link.createWithNewConnections(
        axelarIBCClient,
        wasmIBCClient
      );

      if (saveToFile) {
        const infoPath = path.join(__dirname, "../../../info");
        await fs.promises
          .mkdir(infoPath, { recursive: true })
          .catch(console.error);
        const channelPath = path.join(infoPath, "connection.json");
        fs.writeFileSync(
          channelPath,
          JSON.stringify({
            axelar: {
              connectionId: this.link.endA.connectionID,
            },
            wasm: {
              connectionId: this.link.endB.connectionID,
            },
          })
        );
      }
    }

    return {
      axelar: {
        connectionId: this.link.endA.connectionID,
      },
      wasm: {
        connectionId: this.link.endB.connectionID,
      },
    };
  }

  async createChannel(sender: "A" | "B", saveToFile = false) {
    if (!this.link) {
      throw new Error("Link not initialized");
    }

    if (this.channel) return this.channel;

    const channel = await this.getCurrentChannel();
    if (channel) {
      // console.log("Using existing channel", channel);
      return channel;
    }

    this.channel = await this.link?.createChannel(
      sender,
      "transfer",
      "transfer",
      Order.ORDER_UNORDERED,
      "ics20-1"
    );

    if (saveToFile) {
      const infoPath = path.join(__dirname, "../../../info");
      await fs.promises
        .mkdir(infoPath, { recursive: true })
        .catch(console.error);
      const channelPath = path.join(infoPath, "channel.json");
      fs.writeFileSync(channelPath, JSON.stringify(this.channel));
    }

    return this.channel;
  }

  async relayPackets() {
    if (!this.link) {
      throw new Error("Link not initialized");
    }

    // Update the clients to get the latest height. Otherwise, the relayer will not relay packets
    await this.link!.updateClient("A");
    await this.link!.updateClient("B");

    this.lastRelayedHeight = await this.link!.checkAndRelayPacketsAndAcks(
      this.lastRelayedHeight,
      2,
      6
    );

    return this.lastRelayedHeight;
  }
}
