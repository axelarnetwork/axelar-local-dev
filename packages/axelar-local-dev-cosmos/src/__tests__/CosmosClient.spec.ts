import { CosmosClient } from "../CosmosClient";

describe("CosmosClient", () => {
  const cosmosClient = new CosmosClient();

  it("should start Cosmos", () => {
    cosmosClient.start();
  });

  it("should stop Cosmos", () => {
    cosmosClient.stop();
  });
});
