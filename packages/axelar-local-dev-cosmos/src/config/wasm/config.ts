import path from "path";
import { ChainConfig, CosmosChainInfo } from "../../types";
import { Path } from "../../path";

export const defaultWasmConfig: ChainConfig = {
  dockerPath: Path.docker("wasm"),
  lcdWaitTimeout: 180000,
  rpcWaitTimeout: 180000,
  onCompleted: () => {},
};

export const defaultWasmChainInfo: Omit<CosmosChainInfo, "owner"> = {
  prefix: "wasm",
  denom: "uwasm",
  lcdUrl: "http://localhost/wasm-lcd",
  rpcUrl: "http://localhost/wasm-rpc",
  wsUrl: "ws://localhost/wasm-rpc/websocket",
};
