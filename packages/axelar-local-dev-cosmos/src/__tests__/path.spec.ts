import { Path } from "../path";

describe("path", () => {
  it("should define path correctly", () => {
    expect(Path.base).toContain(
      "axelar-local-dev/packages/axelar-local-dev-cosmos",
    );
    expect(Path.info).toContain(
      "axelar-local-dev/packages/axelar-local-dev-cosmos/info",
    );
    expect(Path.docker("axelar")).toContain(
      "axelar-local-dev/packages/axelar-local-dev-cosmos/docker/axelar",
    );
    expect(Path.docker("wasm")).toContain(
      "axelar-local-dev/packages/axelar-local-dev-cosmos/docker/wasm",
    );
  });
});
