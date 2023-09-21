import { stop } from "../src/lib/docker";

export default async () => {
  await stop();
};
