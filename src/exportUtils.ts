'use strict';

import { ethers } from 'ethers';
import { setJSON } from './utils';
import { Network, NetworkOptions } from './Network';
import { RelayData, evmRelayer, aptosRelayer, relay } from './relay';
import { createNetwork, forkNetwork, listen, stopAll } from './networkUtils';
import { testnetInfo, mainnetInfo } from './info';

let interval: any;

export interface CreateLocalOptions {
    chainOutputPath?: string;
    accountsToFund?: string[];
    fundAmount?: string;
    chains?: string[];
    relayInterval?: number;
    port?: number;
    afterRelay?: (relayData: RelayData) => void;
    callback?: (network: Network, info: any) => Promise<void>;
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
    afterRelay?: (relayData: RelayData) => void;
    callback?: (network: Network, info: any) => Promise<null>;
}

let relaying = false;
export async function createAndExport(options: CreateLocalOptions = {}) {
    const defaultOptions = {
        chainOutputPath: './local.json',
        accountsToFund: [],
        fundAmount: ethers.utils.parseEther('100').toString(),
        chains: ['Moonbeam', 'Avalanche', 'Fantom', 'Ethereum', 'Polygon'],
        port: 8500,
        relayInterval: 2000,
    } as CreateLocalOptions;
    for (const option in defaultOptions) (options as any)[option] = (options as any)[option] || (defaultOptions as any)[option];
    const chains_local: Record<string, any>[] = [];
    let i = 0;
    for (const name of options.chains!) {
        const chain = await createNetwork({
            name: name,
            seed: name,
            ganacheOptions: {},
        });
        const testnet = testnetInfo.find((info: any) => {
            return info.name == name;
        });
        const info = chain.getCloneInfo() as any;
        info.rpc = `http://localhost:${options.port}/${i}`;
        (info.tokenName = testnet?.tokenName), (info.tokenSymbol = testnet?.tokenSymbol), chains_local.push(info);
        const [user] = chain.userWallets;
        for (const account of options.accountsToFund!) {
            await user
                .sendTransaction({
                    to: account,
                    value: options.fundAmount,
                })
                .then((tx) => tx.wait());
        }
        if (options.callback) await options.callback(chain, info);
        i++;
    }
    listen(options.port!);
    interval = setInterval(async () => {
        if (relaying) return;
        relaying = true;
        await relay().catch(() => undefined);
        if (options.afterRelay) {
            options.afterRelay(evmRelayer.relayData);
            options.afterRelay(aptosRelayer.relayData);
        }
        relaying = false;
    }, options.relayInterval);
    setJSON(chains_local, options.chainOutputPath!);
}

export async function forkAndExport(options: CloneLocalOptions = {}) {
    const defaultOptions = {
        chainOutputPath: './local.json',
        accountsToFund: [],
        fundAmount: ethers.utils.parseEther('100').toString(),
        env: 'mainnet',
        chains: [],
        port: 8500,
        relayInterval: 2000,
        networkOptions: {},
    } as CloneLocalOptions;
    for (const option in defaultOptions) (options as any)[option] = (options as any)[option] || (defaultOptions as any)[option];
    const chains_local: Record<string, any>[] = [];
    if (options.env != 'mainnet' && options.env != 'testnet') {
        console.log(`Forking ${options.env.length} chains from custom data.`);
    }
    const chainsRaw = options.env == 'mainnet' ? mainnetInfo : options.env == 'testnet' ? testnetInfo : options.env;

    const chains =
        options.chains?.length == 0
            ? chainsRaw
            : chainsRaw.filter(
                  (chain: any) => options.chains?.find((name) => name.toLocaleLowerCase() == chain.name.toLocaleLowerCase()) != null
              );

    let i = 0;
    for (const chain of chains) {
        const network = await forkNetwork(chain, options.networkOptions);

        const info = network.getCloneInfo() as any;
        info.rpc = `http://localhost:${options.port}/${i}`;
        (info.tokenName = chain?.tokenName), (info.tokenSymbol = chain?.tokenSymbol), chains_local.push(info);
        const [user] = network.userWallets;
        for (const account of options.accountsToFund!) {
            await user
                .sendTransaction({
                    to: account,
                    value: options.fundAmount,
                })
                .then((tx) => tx.wait());
        }
        if (options.callback) await options.callback!(network, info);
        i++;
    }
    listen(options.port!);
    interval = setInterval(async () => {
        await evmRelayer.relay();
        if (options.afterRelay) options.afterRelay(evmRelayer.relayData);
    }, options.relayInterval);
    setJSON(chains_local, options.chainOutputPath!);
}

export async function destroyExported() {
    stopAll();
    if (interval) {
        clearInterval(interval);
    }
    evmRelayer.contractCallGasEvents.length = 0;
    evmRelayer.contractCallWithTokenGasEvents.length = 0;
    aptosRelayer.contractCallGasEvents.length = 0;
}
