import { setLogger } from "@axelar-network/axelar-local-dev";
import { getOwnerAccount } from "../docker";
import { fetchAxelarLcd } from "./lib/fetchLcd";
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

  it("should have governance account", async () => {});

  it("should have registered evm chain", async () => {
    const response = await fetchAxelarLcd("axelar/evm/v1beta1/params/Ethereum");
    const { token_code, network, chain, burnable } = response.params;
    expect(token_code).toBeDefined();
    expect(burnable).toBeDefined();
    expect(network).toBe("ethereum");
    expect(chain).toBe("Ethereum");
  });

  it("should have registered wasm chain", async () => {
    const response = await fetchAxelarLcd(
      "axelar/nexus/v1beta1/chain_state/wasm"
    );
    const { activated, chain } = response.state;
    expect(chain).toEqual({
      name: "wasm",
      supports_foreign_assets: true,
      key_type: "KEY_TYPE_NONE",
      module: "axelarnet",
    });
    expect(activated).toBe(true);
  });

  it("should have chain maintainer for ethereum", async () => {
    const response = await fetchAxelarLcd(
      "axelar/nexus/v1beta1/chain_maintainers/ethereum"
    );
    expect(response.maintainers.length).toBeGreaterThan(0);
  });

  it("should have channel id between axelar <-> wasm", async () => {
    const response = await fetchAxelarLcd("ibc/core/channel/v1/channels");
    expect(response.channels[0]).toEqual({
      state: "STATE_OPEN",
      ordering: "ORDER_UNORDERED",
      counterparty: {
        port_id: "transfer",
        channel_id: "channel-0",
      },
      connection_hops: ["connection-2"],
      version: "ics20-1",
      port_id: "transfer",
      channel_id: "channel-0",
    });
  });
});
