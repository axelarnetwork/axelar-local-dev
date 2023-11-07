import { CosmosClient, IBCRelayerClient, AxelarListener } from "../"; // Replace with your actual import path

export class IBCRelayerRunner {
  wasmClient: CosmosClient;
  axelarClient: CosmosClient;
  relayerClient: IBCRelayerClient;
  public srcChannelId?: string;
  public destChannelId?: string;

  private constructor(
    wasmClient: CosmosClient,
    axelarClient: CosmosClient,
    relayerClient: IBCRelayerClient
  ) {
    this.wasmClient = wasmClient;
    this.axelarClient = axelarClient;
    this.relayerClient = relayerClient;
  }

  static async create(testMnemonic: string) {
    const wasmClient = await CosmosClient.create("wasm");
    const axelarClient = await CosmosClient.create("axelar");
    const relayerClient = await IBCRelayerClient.create(testMnemonic);

    return new IBCRelayerRunner(wasmClient, axelarClient, relayerClient);
  }

  public async relay() {
    return this.relayerClient.relayPackets();
  }

  public async setup() {
    // Initialize the connection and channel
    await this.relayerClient.fundRelayerAccountsIfNeeded();
    await this.relayerClient.initConnection(true);
    const { dest, src } = await this.relayerClient.createChannel("B", true);
    this.srcChannelId = src.channelId;
    this.destChannelId = dest.channelId;
    console.log("Created IBC Channel:", src, dest);
  }

  public async run(interval: number = 10000) {
    return setInterval(async () => {
      await this.relay();
    }, interval);
  }
}
