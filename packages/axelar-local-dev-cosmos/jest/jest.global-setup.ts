import fs from "fs";
import { setLogger } from "@axelar-network/axelar-local-dev";
import { start, startAll } from "../src/docker";
import { defaultConfig } from "../src/wasm/config";

setLogger(() => undefined);

export default async () => {
  const config = await start("wasm");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  fs.writeFileSync("./config.json", JSON.stringify(config));
};
