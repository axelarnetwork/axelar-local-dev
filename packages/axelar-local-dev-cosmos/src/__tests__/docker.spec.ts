import { setLogger } from "@axelar-network/axelar-local-dev";
import { getOwnerAccount, start, stop } from "../lib/docker";
import { CosmosClient } from "../CosmosClient";
import fetch from "node-fetch";

setLogger(() => undefined);

describe("docker", () => {
  const chain = {
    name: "testchain",
    port: 1317,
    rpcPort: 26657,
    denom: "testdenom",
  };

  it("should start Cosmos container successfully", async () => {
    const { owner, rpcUrl, lcdUrl, denom } = await start({ chain });

    expect(owner.mnemonic).toBeDefined();
    expect(owner.address).toBeDefined();
    expect(rpcUrl).toBeDefined();
    expect(lcdUrl).toBeDefined();
    expect(denom).toBe(chain.denom);
  });

  it.only('should start Cosmos container with default denom "udemo"', async () => {
    const config = await start({
      chain,
    });

    const cosmosClient = await CosmosClient.create({
      owner: await getOwnerAccount(chain.name),
    });

    const owner = await cosmosClient.getOwnerAccount();
    const balance = await cosmosClient.getBalance(owner);
    console.log(balance);

    expect(parseInt(balance)).toBeGreaterThan(1);
    expect(config.denom).toBe(chain.denom);
  });

  it("should stop Cosmos container gracefully", async () => {
    await stop();
    await fetch("http://localhost:1317/").catch((e) => {
      expect(e.message).toContain("ECONNREFUSED");
    });
  });
});
