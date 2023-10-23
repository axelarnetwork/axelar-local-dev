import fs from "fs";
import path from "path";
import { CosmosClient } from "../CosmosClient";

describe("CosmosClient", () => {
  let cosmosClient: CosmosClient;

  beforeAll(async () => {
    const config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
    cosmosClient = await CosmosClient.create(config);
  });

  it("should query the balance", async () => {
    const balance = await cosmosClient.getOwnerAccount();
    expect(parseInt(balance || "0")).toBeGreaterThan(0);
  });

  it("should be able to upload wasm contract", async () => {
    const _path = path.resolve(__dirname, "../..", "wasm/multi_send.wasm");
    const response = await cosmosClient.uploadWasm(_path);

    expect(response).toBeDefined();
  });

  it.only("should be able to execute the wasm contract", async () => {
    const _path = path.resolve(__dirname, "../..", "wasm/multi_send.wasm");
    const response = await cosmosClient.uploadWasm(_path);

    const { client } = cosmosClient;
    const ownerAddress = await cosmosClient.getOwnerAccount();

    const { contractAddress } = await client.instantiate(
      ownerAddress,
      response.codeId,
      {
        channel: "channel-0",
      },
      "amazing random contract",
      "auto"
    );

    const denom = cosmosClient.chainInfo.denom;

    console.log(
      "Current Balance:",
      await cosmosClient.getBalance(ownerAddress),
      denom
    );

    const response2 = await client.execute(
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

    console.log("Response", response2);
  });
});
