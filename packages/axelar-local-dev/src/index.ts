import { mainnetInfo, testnetInfo } from './info';
import { networks } from './Network';
import * as compiledContracts from './contracts';
import {
    ChainCloneData,
    createNetwork,
    forkNetwork,
    getAllNetworks,
    getDepositAddress,
    getFee,
    getGasPrice,
    getNetwork,
    listen,
    setupNetwork,
    stop,
    stopAll,
} from './networkUtils';
import { defaultAccounts, deployContract, setJSON, setLogger } from './utils';

// export * from './near';
export * from './aptos';
export * from './exportUtils';
export * from './relay';
export * from './utils';
export * from './Network';

export const contracts = compiledContracts;

export {
    ChainCloneData,
    getFee,
    getGasPrice,
    listen,
    createNetwork,
    forkNetwork,
    getNetwork,
    getAllNetworks,
    setupNetwork,
    stop,
    stopAll,
    getDepositAddress,
    networks,
    testnetInfo,
    mainnetInfo,
};

export const utils = {
    deployContract,
    defaultAccounts,
    setJSON,
    setLogger,
};
