import { stopAll, startAll } from "../src/docker";

export default async () => {
  await startAll();
  // await new Promise((resolve) => setTimeout(resolve, 3000));
};
