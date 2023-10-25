import path from "path";
import { ChainConfig } from "../types";

export const defaultConfig: ChainConfig = {
  lcdPort: 11317,
  rpcPort: 36657,
  healthcheckEndpoint: "health",
  dockerPath: path.join(__dirname, "../../docker/axelar"),
};
