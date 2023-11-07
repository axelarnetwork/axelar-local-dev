import path from "path";
import { exec } from "child_process";
import { ChainConfig } from "../../types";

const dockerPath = path.join(__dirname, "../../docker/axelar");

const runChainSetup = () => {
  return new Promise((resolve, reject) => {
    console.debug(`You can monitor the setup log at ${dockerPath}/setup.log`)
    exec(
      `${dockerPath}/bin/setup.sh > ${dockerPath}/setup.log 2>&1`,
      (error: any, stdout: any, stderr: any) => {
        if (error || stderr) {
          return reject(error);
        }
        resolve(true);
      }
    );
  });
};

export const defaultAxelarConfig: ChainConfig = {
  dockerPath,
  onCompleted: async () => {
    // wait for 10 sec
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log(`Running axelar setup...`);
    try {
      await runChainSetup();
      console.log(`Axelar setup completed!`);
    } catch (e) {
      console.log(`Axelar setup failed!`, e);
    }
  },
};
