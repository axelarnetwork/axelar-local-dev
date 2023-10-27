import path from "path";
import { ChainConfig } from "../types";

export const defaultConfig: ChainConfig = {
  dockerPath: path.join(__dirname, "../../docker/wasm"),
};
