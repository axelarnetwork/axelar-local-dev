import { deployContract, defaultAccounts, setJSON, setLogger } from './utils';
import { testnetInfo, mainnetInfo } from './info';
import { networks } from './Network';
import * as compiledContracts from './contracts';
import {
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
} from './networkUtils';

export * from './relay';
export * from './aptos';
export * from './utils';
export * from './exportUtils';

export const utils = {
    deployContract,
    defaultAccounts,
    setJSON,
    setLogger,
};

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
