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
    const balance = await cosmosClient.getOwnerBalance();
    expect(parseInt(balance || "0")).toBeGreaterThan(0);
  });

  it.only("should be able to upload wasm contract", async () => {
    const _path = path.resolve(__dirname, "../..", "wasm/multi_send.wasm");
    console.log("contract path:", _path);
    const response = await cosmosClient.uploadWasm(_path);
    console.log(response);

    expect(response).toBeDefined();
  });
});
