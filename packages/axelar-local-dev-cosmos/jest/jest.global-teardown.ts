import { stopAll } from "../src/setup";

export default async () => {
  try {
    await stopAll();
  } catch (e) {
    console.error(
      "\nPlease make sure you have started the docker containers by running `npm start` before running tests"
    );
    throw e;
  }
};
