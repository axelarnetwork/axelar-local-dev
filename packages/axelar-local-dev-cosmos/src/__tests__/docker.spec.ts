import { start, stop } from "../lib/docker";
import fetch from "node-fetch";

describe("docker", () => {
  afterEach(async () => {
    await stop();
  });

  it("should start Cosmos container successfully", async () => {
    await start();
  });

  it("should stop Cosmos container gracefully", async () => {
    await stop();
    await fetch("http://localhost:1317/").catch((e) => {
      expect(e.message).toContain("ECONNREFUSED");
    });
  });
});
