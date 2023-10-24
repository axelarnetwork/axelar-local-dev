import { setLogger } from "@axelar-network/axelar-local-dev";
import { defaultDenom, getOwnerAccount, start, stop } from "../lib/docker";
import { CosmosClient } from "../CosmosClient";
import fetch from "node-fetch";

setLogger(() => undefined);

describe("docker", () => {
  it("should start Cosmos container successfully", async () => {
    const chain = {
      name: "testchain",
      port: 1317,
      rpcPort: 26657,
      denom: "testdenom",
    };
    const { owner, rpcUrl, lcdUrl, denom } = await start({ chain });

    expect(owner.mnemonic).toBeDefined();
    expect(owner.address).toBeDefined();
    expect(rpcUrl).toBeDefined();
    expect(lcdUrl).toBeDefined();
    expect(denom).toBe(chain.denom);
  });

  it.only('should start Cosmos container with default denom "udemo"', async () => {
    const owner = await getOwnerAccount();
    const cosmosClient = await CosmosClient.create({
      owner,
    });

    const balance = await cosmosClient.getBalance(owner.address);

    expect(parseInt(balance)).toBeGreaterThan(1);
    expect(cosmosClient.getChainInfo().denom).toBe(defaultDenom);
  });

  it("should stop Cosmos container gracefully", async () => {
    await stop();
    await fetch("http://localhost:1317/").catch((e) => {
      expect(e.message).toContain("ECONNREFUSED");
    });
  });
});
