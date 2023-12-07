import { IBCRelayerClient } from "../clients";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

describe("IBCRelayerClient", () => {
  it.skip("should be able to create a connection and channel", async () => {
    const relayerClient = await IBCRelayerClient.create();

    const response = await relayerClient.initConnection();

    expect(response.axelar).toBeDefined();
    expect(response.wasm).toBeDefined();

    const response2 = await relayerClient.createChannel("B");

    expect(response2).toBeDefined();
    expect(response2!.src).toBeDefined();
    expect(response2!.dest).toBeDefined();
  });

  it("should create a wallet from a mnemonic if provided", async () => {
    const mockMnemonic = await DirectSecp256k1HdWallet.generate(12).then(
      (w) => w.mnemonic
    );
    const result = await IBCRelayerClient.create(mockMnemonic);

    expect(result.relayerAccountManager.relayerAccount.mnemonic).toEqual(
      mockMnemonic
    );
  });

  it("should generate a new wallet if no mnemonic is provided", async () => {
    const result = await IBCRelayerClient.create();

    expect(result).toBeDefined();
    expect(result.relayerAccountManager.relayerAccount.mnemonic).toBeDefined();
  });
});
