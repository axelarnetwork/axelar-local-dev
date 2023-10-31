import { IBCRelayerClient } from "../clients/IBCRelayerClient";

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
});
