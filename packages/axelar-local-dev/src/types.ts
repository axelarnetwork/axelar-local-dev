import { Network, NetworkOptions } from './Network';
import { RelayData, RelayerMap } from './relay';

export interface CreateLocalOptions {
    chainOutputPath?: string;
    accountsToFund?: string[];
    fundAmount?: string;
    chains?: string[];
    relayInterval?: number;
    port?: number;
    relayers?: RelayerMap;
    afterRelay?: (relayData: RelayData) => void;
    callback?: (network: Network, info: any) => Promise<void>;
}

export type SetupChain = {
    rpcUrl: string;
    name: string;
};

export interface SetupLocalOptions {
    chains: SetupChain[];
    seed?: string;
    relayInterval?: number;
    afterRelay?: (relayData: RelayData) => void;
    callback?: (network: Network, info: any) => Promise<void>;
    chainOutputPath?: string;
}

export interface CloneLocalOptions {
    chainOutputPath?: string;
    accountsToFund?: string[];
    fundAmount?: string;
    env?: string | any;
    chains?: string[];
    relayInterval?: number;
    port?: number;
    networkOptions?: NetworkOptions;
    relayers?: RelayerMap;
    afterRelay?: (relayData: RelayData) => void;
    callback?: (network: Network, info: any) => Promise<null>;
}
