import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { IbcClient, Link, RelayedHeights } from "@confio/relayer";
import { ChannelPair } from "@confio/relayer/build/lib/link";
import { CosmosClient } from "../clients/CosmosClient";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { convertCosmosAddress } from "../docker";
import { CosmosChain } from "../types";

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

  static async create(mnemonic?: string) {
    const axelarClient = await CosmosClient.create("axelar");
    const wasmClient = await CosmosClient.create("wasm");

    const relayer = await IBCRelayerClient.createRelayerAccount(
      "wasm",
      mnemonic
    );

    return new IBCRelayerClient(axelarClient, wasmClient, relayer);
  }

  private static async createRelayerAccount(
    prefix: CosmosChain,
    mnemonic?: string
  ) {
    if (mnemonic) {
      return await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix,
      });
    }

    return await DirectSecp256k1HdWallet.generate(12, {
      prefix,
    });
  }

  async fundRelayerAccountsIfNeeded(minAmount = "10000000") {
    const fund = await this.getRelayerFund();

    if (
      ethers.BigNumber.from(fund.wasm.balance).lt(minAmount) ||
      ethers.BigNumber.from(fund.axelar.balance).lt(minAmount)
    ) {
      await this.fundRelayer(minAmount);
    }
  }

  async fundRelayer(amount = "1000000000") {
    const relayerAddress = await this.getRelayerAddress("wasm");
    const relayerAxelarAddress = await this.getRelayerAddress("axelar");

    // Fund the relayer address
    await this.wasmClient.fundWallet(relayerAddress, amount);
    console.log(
      `Funded ${amount}${
        this.wasmClient.getChainInfo().denom
      } to relayer address on wasm:`,
      relayerAddress
    );
    await this.axelarClient.fundWallet(relayerAxelarAddress, amount);
    console.log(
      `Funded ${amount}${
        this.axelarClient.getChainInfo().denom
      } to relayer address on axelar:`,
      relayerAxelarAddress
    );
  }

  async getRelayerFund() {
    // check the fund
    const relayerAddress = await this.getRelayerAddress("wasm");
    const relayerAxelarAddress = await this.getRelayerAddress("axelar");

    const balance = await this.wasmClient.getBalance(relayerAddress);
    console.log("Relayer wasm balance", balance);
    const axelarBalance = await this.axelarClient.getBalance(
      relayerAxelarAddress
    );
    console.log("Relayer axelar balance", relayerAxelarAddress, axelarBalance);

    return {
      wasm: {
        address: relayerAddress,
        balance,
      },
      axelar: {
        address: relayerAxelarAddress,
        balance: axelarBalance,
      },
    };
  }

  async getRelayerAddress(prefix: CosmosChain = "wasm") {
    const relayerAddress = await this.relayerAccount
      .getAccounts()
      .then((accounts) => accounts[0].address);

    if (prefix === "wasm") {
      return relayerAddress;
    }

    return convertCosmosAddress(relayerAddress, prefix);
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

  getCurrentConnection() {
    try {
      const json = fs.readFileSync(
        path.join(__dirname, "../../info/connection.json"),
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
        path.join(__dirname, "../../info/channel.json"),
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
      console.log("Using existing connection", connection);
      this.link = await Link.createWithExistingConnections(
        axelarIBCClient,
        wasmIBCClient,
        connection.axelar.connectionId,
        connection.wasm.connectionId
      );
    } else {
      console.log("Creating new connection");
      this.link = await Link.createWithNewConnections(
        axelarIBCClient,
        wasmIBCClient
      );

      if (saveToFile) {
        const infoPath = path.join(__dirname, "../../info");
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
      console.log("Using existing channel", channel);
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
      const infoPath = path.join(__dirname, "../../info");
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
