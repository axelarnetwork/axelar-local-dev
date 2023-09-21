import { CosmosClient } from "../CosmosClient";
import fs from "fs";

describe("CosmosClient", () => {
  let cosmosClient: CosmosClient;

  beforeAll(async () => {
    const config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
    cosmosClient = new CosmosClient(config);
    await cosmosClient.init();
  });

  it("should query the balance", async () => {
    const balance = await cosmosClient.getOwnerBalance();
    expect(parseInt(balance || "0")).toBeGreaterThan(0);
  });
});
