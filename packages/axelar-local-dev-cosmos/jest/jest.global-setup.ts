import { setLogger } from "@axelar-network/axelar-local-dev";
import { start } from "../src/lib/docker";
import fs from "fs";

setLogger(() => undefined);

export default async () => {
  const config = await start();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  fs.writeFileSync("./config.json", JSON.stringify(config));
};
