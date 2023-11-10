import { exec } from "child_process";
import { ChainConfig, CosmosChainInfo } from "../../types";
import { Path } from "../../path";

const dockerPath = Path.docker("axelar");

const runChainSetup = () => {
  return new Promise((resolve, reject) => {
    console.debug(`You can monitor the setup log at ${dockerPath}/setup.log`);
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

export const defaultAxelarChainInfo: Omit<CosmosChainInfo, "owner"> = {
  prefix: "axelar",
  denom: "uaxl",
  lcdUrl: "http://localhost/axelar-lcd",
  rpcUrl: "http://localhost/axelar-rpc",
  wsUrl: "ws://localhost/axelar-rpc/websocket",
};
