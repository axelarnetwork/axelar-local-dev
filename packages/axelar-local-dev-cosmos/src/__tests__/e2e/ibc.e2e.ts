import path from "path";
import { CosmosClient, IBCRelayerClient } from "../..";
import { ChannelInfo } from "@confio/relayer/build/lib/ibcclient";

describe.skip("E2E - IBC", () => {
  let wasmClient: CosmosClient;
  let axelarClient: CosmosClient;
  let relayerClient: IBCRelayerClient;
  let srcChannelId: string;
  let destChannelId: string;

  it("ibc transfer", async () => {
    const ownerAddress = await wasmClient.getOwnerAccount();
    const recipient = "axelar1puut77ku823785u3c7aalwqdrawe3lnjxuv68x";

    // Send tokens to the recipient
    await wasmClient.ibcTransfer(
      ownerAddress,
      recipient,
      srcChannelId,
      "10000"
    );

    // Get the ibc denom
    const ibcDenom = axelarClient.getIBCDenom(destChannelId, "uwasm");

    // Relay the packet
    await relayerClient.relayPackets();

    // Check the balance on axelar chain
    const ibcAmount = await axelarClient.getBalance(recipient, ibcDenom);
    expect(parseInt(ibcAmount)).toBeGreaterThan(0);
  });

  // Usually takes 2-3 minutes to run
  it("should be able to execute the wasm contract from wasm to axelar chain", async () => {
    // Upload the wasm contract
    const _path = path.resolve(__dirname, "../..", "wasm/multi_send.wasm");
    const response = await wasmClient.uploadWasm(_path);

    // Instantiate the contract
    const { client } = wasmClient;
    const ownerAddress = await wasmClient.getOwnerAccount();
    const { contractAddress } = await client.instantiate(
      ownerAddress,
      response.codeId,
      {
        channel: srcChannelId,
      },
      "amazing random contract",
      "auto"
    );

    const denom = wasmClient.chainInfo.denom;

    const execution = await client.execute(
      ownerAddress,
      contractAddress,
      {
        multi_send_to_evm: {
          destination_chain: "ethereum",
          destination_address: "0x49324C7f83568861AB1b66E547BB1B66431f1070",
          recipients: ["0x49324C7f83568861AB1b66E547BB1B66431f1070"],
        },
      },
      "auto",
      "test",
      [{ amount: "1000000", denom }]
    );

    await relayerClient.relayPackets();

    expect(execution).toBeDefined();
  });
});
