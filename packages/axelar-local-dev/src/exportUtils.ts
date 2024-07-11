'use strict';

import { ethers } from 'ethers';
import { setJSON } from './utils';
import { networks } from './Network';
import { RelayerMap, relay } from './relay';
import { createNetwork, forkNetwork, listen, setupNetwork, stopAll } from './networkUtils';
import { testnetInfo } from './info';
import { EvmRelayer } from './relay/EvmRelayer';
import { getChainArray } from '@axelar-network/axelar-chains-config';
import { registerRemoteITS } from './its';
import { CloneLocalOptions, CreateLocalOptions, SetupLocalOptions } from './types';

let interval: any;

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
        info.rpc = `http://127.0.0.1:${_options.port}/${i}`;
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
        await relay(_options.relayers).catch((e) => console.error(e));
        if (options.afterRelay) {
            const evmRelayData = _options.relayers.evm?.relayData;
            const nearRelayData = _options.relayers.near?.relayData;
            const aptosRelayData = _options.relayers.aptos?.relayData;
            const suiRelayData = _options.relayers.sui?.relayData;
            const multiversXRelayData = _options.relayers.multiversx?.relayData;

            evmRelayData && (await options.afterRelay(evmRelayData));
            nearRelayData && (await options.afterRelay(nearRelayData));
            aptosRelayData && (await options.afterRelay(aptosRelayData));
            suiRelayData && (await options.afterRelay(suiRelayData));
            multiversXRelayData && (await options.afterRelay(multiversXRelayData));
        }
        relaying = false;
    }, _options.relayInterval);

    const evmRelayer = _options.relayers['evm'];
    evmRelayer?.subscribeExpressCall();

    setJSON(localChains, _options.chainOutputPath);
}

export async function setupAndExport(options: SetupLocalOptions) {
    const { afterRelay, callback, chainOutputPath, chains, relayInterval, seed } = options;

    if (chains.length < 2) {
        throw Error('At least 2 chains are required to setup and export');
    }

    for (const chain of chains) {
        // check if given rpc url is valid using ethers.js to get latest block
        const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
        await provider.getBlockNumber().catch((e) => {
            throw Error(`Please check if the ${chain.name} chain is running on ${chain.rpcUrl}`)
        });
    }

    const _options = {
        chainOutputPath: chainOutputPath || './local.json',
        chains,
        afterRelay: afterRelay || null,
        relayers: { evm: defaultEvmRelayer },
        callback: callback || null,
        relayInterval: relayInterval || 2000,
    };

    const networkInfos = [];
    const networks = [];
    for (let i = 0; i < chains.length; i++) {
        const network = await setupNetwork(chains[i].rpcUrl, { seed, name: chains[i].name });
        networks.push(network);

        const networkInfo = network.getInfo() as any;
        networkInfo.rpc = chains[i].rpcUrl;
        networkInfos.push(networkInfo);

        if (_options.callback) await _options.callback(network, networkInfo);
        if (Object.keys(network.tokens).length > 0) {
            // Check if there is a USDC token.
            const alias = Object.keys(network.tokens).find((alias) => alias.toLowerCase().includes('usdc'));

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

    setJSON(networkInfos, _options.chainOutputPath);
    return networks;
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
        info.rpc = `http://127.0.0.1:${options.port}/${i}`;
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
