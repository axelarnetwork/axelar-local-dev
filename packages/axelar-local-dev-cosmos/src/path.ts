import path from "path";
import { CosmosChain } from "./types";

export const Path = {
  base: path.join(__dirname, ".."),
  docker: (chain: CosmosChain) => path.join(__dirname, "../docker", chain),
  info: path.join(__dirname, "..", "info"),
};
