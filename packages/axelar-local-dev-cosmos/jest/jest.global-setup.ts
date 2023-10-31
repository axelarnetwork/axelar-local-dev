import { stopAll, startAll, waitForRpc } from "../src/docker";

export default async () => {
  try {
    await waitForRpc("axelar", 5000);
    await waitForRpc("wasm", 5000);
  } catch (e) {
    console.error(
      "\nPlease make sure you have started the docker containers by running `npm start` before running tests"
    );
    throw e;
  }
};
