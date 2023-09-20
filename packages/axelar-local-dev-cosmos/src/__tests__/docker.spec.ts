import { start, stop } from "../lib/docker";

describe("docker", () => {
  afterEach(async () => {
    await stop();
  });

  it("should start Cosmos container successfully", async () => {
    await start();
  });

  it("should stop Cosmos container gracefully", async () => {
    await stop();
  });
});
