'use strict';

import { ethers } from 'ethers';
import { setJSON } from './utils';
import { Network, NetworkOptions, networks } from './Network';
import { RelayData, RelayerMap, relay } from './relay';
import { createNetwork, forkNetwork, getNetwork, listen, setupNetwork, stopAll } from './networkUtils';
import { testnetInfo } from './info';
import { EvmRelayer } from './relay/EvmRelayer';
import { getChainArray } from '@axelar-network/axelar-chains-config';
import { registerRemoteITS } from './its';

let interval: any;

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

export interface SetupLocalOptions {
    rpcUrls: string[];
    chains: string[];
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

const defaultEvmRelayer = new EvmRelayer();

let relaying = false;
export async function createAndExport(options: CreateLocalOptions = {}) {
    const { accountsToFund, afterRelay, callback, chainOutputPath, chains, fundAmount, port, relayInterval, relayers } = options;
    const _options = {
        chainOutputPath: chainOutputPath || './local.json',
        accountsToFund: accountsToFund || [],
        fundAmount: fundAmount || ethers.utils.parseEther('100').toString(),
        chains: chains || ['Moonbeam', 'Avalanche', 'Fantom', 'Ethereum', 'Polygon'],
        port: port || 8500,
        afterRelay: afterRelay || null,
        relayers: relayers || { evm: defaultEvmRelayer },
        callback: callback || null,
        relayInterval: relayInterval || 2000,
    };
    const localChains: Record<string, any>[] = [];
    let i = 0;
    for (const name of _options.chains) {
        const chain = await createNetwork({
            name: name,
            seed: name,
            ganacheOptions: {},
        });
        const testnet = (testnetInfo as any)[name];
        const info = chain.getCloneInfo() as any;
        info.rpc = `http://localhost:${_options.port}/${i}`;
        (info.tokenName = testnet?.tokenName), (info.tokenSymbol = testnet?.tokenSymbol), localChains.push(info);
        const [user] = chain.userWallets;
        for (const account of _options.accountsToFund) {
            await user
                .sendTransaction({
                    to: account,
                    value: _options.fundAmount,
                })
                .then((tx) => tx.wait());
        }
        if (_options.callback) await _options.callback(chain, info);
        if (Object.keys(chain.tokens).length > 0) {
            // Check if there is a USDC token.
            const alias = Object.keys(chain.tokens).find((alias) => alias.toLowerCase().includes('usdc'));

            // If there is no USDC token, return.
            if (!alias) return;
        }

        i++;
    }
    await registerRemoteITS(networks);
    listen(_options.port);
    interval = setInterval(async () => {
        if (relaying) return;
        relaying = true;
        await relay(_options.relayers).catch(() => undefined);
        if (options.afterRelay) {
            const evmRelayData = _options.relayers.evm?.relayData;
            const nearRelayData = _options.relayers.near?.relayData;
            const aptosRelayData = _options.relayers.aptos?.relayData;
            const suiRelayData = _options.relayers.sui?.relayData;

            evmRelayData && (await options.afterRelay(evmRelayData));
            nearRelayData && (await options.afterRelay(nearRelayData));
            aptosRelayData && (await options.afterRelay(aptosRelayData));
            suiRelayData && (await options.afterRelay(suiRelayData));
        }
        relaying = false;
    }, _options.relayInterval);

    const evmRelayer = _options.relayers['evm'];
    evmRelayer?.subscribeExpressCall();

    setJSON(localChains, _options.chainOutputPath);
}

export async function setupAndExport(options: SetupLocalOptions) {
    const { afterRelay, callback, rpcUrls, chainOutputPath, chains, relayInterval, seed } = options;

    if (chains.length < 2) {
        console.log('At least 2 chains are required to setup and export');
        return;
    }

    const _options = {
        chainOutputPath: chainOutputPath || './local.json',
        chains,
        afterRelay: afterRelay || null,
        relayers: { evm: defaultEvmRelayer },
        callback: callback || null,
        relayInterval: relayInterval || 2000,
    };

    const localChains: Record<string, any>[] = [];
    for (let i = 0; i < rpcUrls.length; i++) {
        const chain = await setupNetwork(rpcUrls[i], { seed });

        const info = chain.getCloneInfo() as any;
        info.rpc = rpcUrls[i];
        localChains.push(info);

        if (_options.callback) await _options.callback(chain, info);
        if (Object.keys(chain.tokens).length > 0) {
            // Check if there is a USDC token.
            const alias = Object.keys(chain.tokens).find((alias) => alias.toLowerCase().includes('usdc'));

            // If there is no USDC token, return.
            if (!alias) return;
        }
    }
    await registerRemoteITS(networks);

    interval = setInterval(async () => {
        if (relaying) return;
        relaying = true;
        await relay(_options.relayers).catch(() => undefined);
        if (options.afterRelay) {
            const evmRelayData = _options.relayers.evm?.relayData;
            evmRelayData && (await options.afterRelay(evmRelayData));
        }
        relaying = false;
    }, _options.relayInterval);

    const evmRelayer = _options.relayers['evm'];
    evmRelayer?.subscribeExpressCall();

    setJSON(localChains, _options.chainOutputPath);
}

export async function forkAndExport(options: CloneLocalOptions = {}) {
    const _options = {
        chainOutputPath: options.chainOutputPath || './local.json',
        accountsToFund: options.accountsToFund || [],
        fundAmount: options.fundAmount || ethers.utils.parseEther('100').toString(),
        env: options.env || 'mainnet',
        chains: options.chains || ['Moonbeam', 'Avalanche', 'Fantom', 'Ethereum', 'Polygon'],
        port: options.port || 8500,
        relayInterval: options.relayInterval || 2000,
        relayers: options.relayers || { evm: defaultEvmRelayer },
        networkOptions: options.networkOptions,
        callback: options.callback,
        afterRelay: options.afterRelay,
    };

    const chains_local: Record<string, any>[] = [];
    if (_options.env != 'mainnet' && _options.env != 'testnet') {
        console.log(`Forking ${_options.env.length} chains from custom data.`);
    }
    const chainsRaw =
        _options.env == 'mainnet' ? getChainArray('mainnet') : _options.env == 'testnet' ? getChainArray('testnet') : _options.env;

    const chains =
        _options.chains?.length == 0
            ? chainsRaw
            : chainsRaw.filter(
                  (chain: any) => _options.chains?.find((name) => name.toLocaleLowerCase() == chain.name.toLocaleLowerCase()) != null
              );

    let i = 0;
    for (const chain of chains) {
        const network = await forkNetwork(chain, _options.networkOptions);
        const info = network.getCloneInfo() as any;
        info.rpc = `http://localhost:${options.port}/${i}`;
        (info.tokenName = chain?.tokenName), (info.tokenSymbol = chain?.tokenSymbol), chains_local.push(info);
        const [user] = network.userWallets;
        for (const account of _options.accountsToFund) {
            await user
                .sendTransaction({
                    to: account,
                    value: options.fundAmount,
                })
                .then((tx) => tx.wait());
        }
        await _options.callback?.(network, info);
        i++;
    }
    listen(_options.port);
    interval = setInterval(async () => {
        const evmRelayer = _options.relayers['evm'];
        if (!evmRelayer) return;

        await evmRelayer.relay();
        if (_options.afterRelay) _options.afterRelay(evmRelayer.relayData);
    }, _options.relayInterval);

    const evmRelayer = _options.relayers['evm'];
    evmRelayer?.subscribeExpressCall();

    setJSON(chains_local, _options.chainOutputPath);
}

export async function destroyExported(relayers?: RelayerMap) {
    stopAll();
    if (interval) {
        clearInterval(interval);
    }

    await defaultEvmRelayer?.unsubscribe();

    if (!relayers) return;

    await relayers['evm']?.unsubscribe();

    for (const relayerType in relayers) {
        const relayer = relayers[relayerType];
        if (relayer) {
            relayer.contractCallGasEvents.length = 0;
            relayer.contractCallWithTokenGasEvents.length = 0;
        }
    }

    defaultEvmRelayer.contractCallGasEvents.length = 0;
    defaultEvmRelayer.contractCallWithTokenGasEvents.length = 0;
}
