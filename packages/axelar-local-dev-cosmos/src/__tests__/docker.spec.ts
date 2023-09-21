import { setLogger } from "@axelar-network/axelar-local-dev";
import { start, stop } from "../lib/docker";
import fetch from "node-fetch";

setLogger(() => undefined);

describe.skip("docker", () => {
  it("should start Cosmos container successfully", async () => {
    const { owner, rpcUrl, lcdUrl } = await start();

    expect(owner.mnemonic).toBeDefined();
    expect(owner.address).toBeDefined();
    expect(rpcUrl).toBeDefined();
    expect(lcdUrl).toBeDefined();
  });

  it("should stop Cosmos container gracefully", async () => {
    await stop();
    await fetch("http://localhost:1317/").catch((e) => {
      expect(e.message).toContain("ECONNREFUSED");
    });
  });
});
