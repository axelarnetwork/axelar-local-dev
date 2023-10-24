import { setLogger } from "@axelar-network/axelar-local-dev";
import { defaultDenom, getOwnerAccount, start, stop } from "../lib/docker";
import { CosmosClient } from "../CosmosClient";
import fetch from "node-fetch";

setLogger(() => undefined);

describe("docker", () => {
  it("should start Cosmos container successfully", async () => {
    const response = await fetch("http://localhost:26657/health");
    expect(response.status).toBe(200);
  });

  it('should start Cosmos container with default denom "udemo"', async () => {
    const owner = await getOwnerAccount();
    const cosmosClient = await CosmosClient.create({
      owner,
    });

    const balance = await cosmosClient.getBalance(owner.address);

    expect(parseInt(balance)).toBeGreaterThan(1);
    expect(cosmosClient.getChainInfo().denom).toBe(defaultDenom);
  });

  it.skip("should stop Cosmos container gracefully", async () => {
    await stop();
    await fetch("http://localhost:1317/").catch((e) => {
      expect(e.message).toContain("ECONNREFUSED");
    });
  });
});
