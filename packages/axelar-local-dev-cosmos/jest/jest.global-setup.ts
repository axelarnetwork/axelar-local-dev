import { stopAll, startAll } from "../src/docker";

export default async () => {
  await startAll();
};
