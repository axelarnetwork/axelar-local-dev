import { setLogger } from "@axelar-network/axelar-local-dev";
import { getOwnerAccount } from "../docker";
import { CosmosClient } from "../";
import fetch from "node-fetch";

setLogger(() => undefined);

describe("docker", () => {
  it("should start containers successfully", async () => {
    const testLcd = "cosmos/base/tendermint/v1beta1/node_info";
    const healthAxelarRpc = await fetch("http://localhost/axelar-rpc");
    const healthAxelarLcd = await fetch(
      `http://localhost/axelar-lcd/${testLcd}`
    );
    const healthWasmRpc = await fetch("http://localhost/wasm-rpc");
    const healthWasmLcd = await fetch(`http://localhost/wasm-lcd/${testLcd}`);

    expect(healthAxelarRpc.status).toBe(200);
    expect(healthAxelarLcd.status).toBe(200);
    expect(healthWasmRpc.status).toBe(200);
    expect(healthWasmLcd.status).toBe(200);
  });

  it("should have some balance in the owner account", async () => {
    const owner = await getOwnerAccount("wasm");
    const cosmosClient = await CosmosClient.create();

    const balance = await cosmosClient.getBalance(owner.address);

    expect(parseInt(balance)).toBeGreaterThan(1);
  });

  // it should have governance account

  // it should have registered evm chain

  // it should have registered wasm chain

  // it should have registered broadcaster

  // it should have channel id between axelar <-> wasm
});
