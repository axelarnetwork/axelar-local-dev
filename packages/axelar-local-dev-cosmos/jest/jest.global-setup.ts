import { dockerService } from "../src/setup";

export default async () => {
  try {
    await dockerService.waitForRpc("axelar", 5000);
    await dockerService.waitForRpc("wasm", 5000);
  } catch (e) {
    console.error(
      "\nPlease make sure you have started the docker containers by running `npm start` before running tests"
    );
    throw e;
  }
};
