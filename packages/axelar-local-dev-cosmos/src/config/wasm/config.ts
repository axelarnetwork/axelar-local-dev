import path from "path";
import { ChainConfig, CosmosChainInfo } from "../../types";
import { Path } from "../../path";

export const defaultAgoricConfig: ChainConfig = {
  dockerPath: Path.docker("agoric"),
  lcdWaitTimeout: 180000,
  rpcWaitTimeout: 180000,
  onCompleted: () => {},
};

export const defaultAgoricChainInfo: Omit<CosmosChainInfo, "owner"> = {
  prefix: "agoric",
  denom: "ubld",
  lcdUrl: "http://localhost/agoric-lcd",
  rpcUrl: "http://localhost/agoric-rpc",
  wsUrl: "ws://localhost/agoric-rpc/websocket",
};
