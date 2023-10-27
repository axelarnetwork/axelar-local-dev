import path from "path";
import { CosmosClient } from "../";

describe("CosmosClient", () => {
  let cosmosClient: CosmosClient;

  beforeAll(async () => {
    cosmosClient = await CosmosClient.create();
  });

  it("should query the balance", async () => {
    const owner = await cosmosClient.getOwnerAccount();
    const balance = await cosmosClient.getBalance(owner);
    expect(parseInt(balance || "0")).toBeGreaterThan(0);
  });

  it("should be able to upload wasm contract", async () => {
    const _path = path.resolve(__dirname, "../..", "wasm/multi_send.wasm");
    const response = await cosmosClient.uploadWasm(_path);

    expect(response).toBeDefined();
  });

  it("should be able to send tokens to given address", async () => {
    const recipient = "wasm1kmfc98hsz9cxq9lyezlpr8d0sh5ct244krg6u5";
    const amount = "1000000";
    const initialBalance = await cosmosClient.getBalance(recipient);
    await cosmosClient.fundWallet(recipient, amount);
    const balance = await cosmosClient.getBalance(recipient);
    expect(parseInt(balance)).toBe(parseInt(initialBalance) + parseInt(amount));
  });

  it.skip("should be able to execute the wasm contract", async () => {
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
