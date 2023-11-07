import path from "path";
import { ChainConfig } from "../../types";

export const defaultWasmConfig: ChainConfig = {
  dockerPath: path.join(__dirname, "../../docker/wasm"),
  onCompleted: () => {},
};
