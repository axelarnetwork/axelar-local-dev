import { setLogger } from "@axelar-network/axelar-local-dev";
import { start, stop } from "../lib/docker";
import fetch from "node-fetch";

setLogger(() => undefined);

describe("docker", () => {
  it("should start Cosmos container successfully", async () => {
    const customDenom = "testdenom";
    const { owner, rpcUrl, lcdUrl, denom } = await start({
      chain: {
        denom: customDenom,
        name: "testchain",
        port: 1317,
        rpcPort: 26657,
      },
    });

    expect(owner.mnemonic).toBeDefined();
    expect(owner.address).toBeDefined();
    expect(rpcUrl).toBeDefined();
    expect(lcdUrl).toBeDefined();
    expect(denom).toBe(customDenom);
  });

  it("should stop Cosmos container gracefully", async () => {
    await stop();
    await fetch("http://localhost:1317/").catch((e) => {
      expect(e.message).toContain("ECONNREFUSED");
    });
  });
});
