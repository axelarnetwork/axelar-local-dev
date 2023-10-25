import path from "path";
import { ChainConfig } from "../types";

export const defaultConfig: ChainConfig = {
  lcdPort: 1317,
  rpcPort: 26657,
  healthcheckEndpoint: "health",
  dockerPath: path.join(__dirname, "../../docker/wasm"),
};
