import { exec } from 'child_process';
import { ChainConfig, CosmosChainInfo } from '../../types';
import { Path } from '../../path';
import { logger } from '@axelar-network/axelar-local-dev';

const dockerPath = Path.docker('axelar');

const runChainSetup = () => {
  return new Promise((resolve, reject) => {
    logger.log(`You can monitor the setup log at ${dockerPath}/setup.log`);
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
  lcdWaitTimeout: 300000,
  rpcWaitTimeout: 300000,
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

export const defaultAxelarChainInfo: Omit<CosmosChainInfo, 'owner'> = {
  prefix: 'axelar',
  denom: 'uaxl',
  lcdUrl: 'https://lcd-axelar-testnet.imperator.co',
  rpcUrl: 'https://axelartest-lcd.quickapi.com/',
  wsUrl: 'wss://axelartest-rpc.quantnode.tech/websocket',
};
