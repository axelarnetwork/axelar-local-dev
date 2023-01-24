/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

import { ethers, Wallet, Contract, providers, getDefaultProvider } from 'ethers';
const { keccak256, id, solidityPack, toUtf8Bytes } = ethers.utils;
import { defaultAccounts, setJSON, httpGet, logger } from './utils';
import server from './server';
import { Network, networks, NetworkOptions, NetworkInfo, NetworkSetup } from './Network';
import { merge } from 'lodash';
import fs from 'fs';

import IAxelarGateway from './artifacts/@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarGateway.sol/IAxelarGateway.json';
import IAxelarGasReceiver from './artifacts/@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarGasService.sol/IAxelarGasService.json';
import AxelarGateway from './artifacts/@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway.sol/AxelarGateway.json';
import ConstAddressDeployer from '@axelar-network/axelar-gmp-sdk-solidity/dist/ConstAddressDeployer.json';

let serverInstance: any;

export interface ChainCloneData {
    name: string;
    gateway: string;
    rpc: string;
    chainId: number;
    gasReceiver: string;
    constAddressDeployer: string;
    tokenName: string;
    tokenSymbol: string;
    tokens: { [key: string]: string };
}

export const getFee = () => {
    return 1e6;
};
export const getGasPrice = () => {
    return 1;
};

export function listen(port: number, callback: (() => void) | undefined = undefined) {
    if (!callback)
        callback = () => {
            logger.log(`Serving ${networks.length} networks on port ${port}`);
        };
    serverInstance = server(networks);
    return serverInstance.listen(port, callback);
}

function getGanacheProvider(chain: Network, ganacheOptions: any, accounts?: any, dbPath?: string) {
    const ganache = require('ganache');

    if (ganacheOptions.server) {
        const port = ganacheOptions.server.port;
        console.log('use ganache server');
        const _server = ganache.server({
            ws: true,
            port: ganacheOptions.server.port,
            accounts,
            debug: false,
            networkId: chain.chainId,
            chainId: chain.chainId,
            logger: { log: () => undefined },
        });
        _server.listen(port);
        return _server.provider;
    } else {
        const defaultGanacheOptions = {
            database: { dbPath },
            wallet: {
                accounts,
            },
            chain: {
                chainId: chain.chainId,
                networkId: chain.chainId,
                vmErrorsOnRPCResponse: true,
            },
            logging: { quiet: true },
        };
        const mergedOptions = merge(defaultGanacheOptions, ganacheOptions);
        return ganache.provider(mergedOptions);
    }
}

export async function createNetwork(options: NetworkOptions = {}) {
    if (options.dbPath && fs.existsSync(options.dbPath + '/networkInfo.json')) {
        const info = require(options.dbPath + '/networkInfo.json');
        const ganacheProvider = getGanacheProvider(info, options.ganacheOptions, null, options.dbPath);
        const chain = await getNetwork(new providers.Web3Provider(ganacheProvider), info);
        chain.ganacheProvider = ganacheProvider;
        if (options.port) {
            chain.port = options.port;
            chain.server = server(chain).listen(chain.port, () => {
                logger.log(`Serving ${chain.name} on port ${chain.port}`);
            });
        }
        return chain;
    }

    const chain: Network = new Network();
    chain.name = options.name != null ? options.name : `Chain ${networks.length + 1}`;
    chain.chainId = options.chainId || networks.length + 2500;
    logger.log(`Creating ${chain.name} with a chainId of ${chain.chainId}...`);
    const accounts = defaultAccounts(20, options.seed);
    chain.ganacheProvider = getGanacheProvider(chain, options.ganacheOptions, accounts, options.dbPath);
    chain.provider = new providers.Web3Provider(chain.ganacheProvider);
    const wallets = accounts.map((x: any) => new Wallet(x.secretKey, chain.provider));
    chain.userWallets = wallets.splice(10, 20);
    [chain.ownerWallet, chain.operatorWallet, chain.relayerWallet] = wallets;
    chain.adminWallets = wallets.splice(4, 10);
    chain.threshold = 3;
    chain.lastRelayedBlock = await chain.provider.getBlockNumber();
    await chain._deployConstAddressDeployer();
    await chain._deployGateway();
    await chain._deployGasReceiver();
    chain.tokens = {};

    if (options.port) {
        chain.port = options.port;
        chain.server = server(chain).listen(chain.port, () => {
            logger.log(`Serving ${chain.name} on port ${chain.port}`);
        });
    }
    if (options.dbPath) {
        setJSON(chain.getInfo(), options.dbPath + '/networkInfo.json');
    }
    networks.push(chain);
    return chain;
}

export async function getNetwork(urlOrProvider: string | providers.Provider, info: NetworkInfo | undefined = undefined) {
    if (!info) info = (await httpGet(urlOrProvider + '/info')) as NetworkInfo;
    const chain: Network = new Network();
    chain.name = info.name;
    chain.chainId = info.chainId;
    logger.log(`It is ${chain.name} and has a chainId of ${chain.chainId}...`);

    if (typeof urlOrProvider == 'string') {
        chain.provider = ethers.getDefaultProvider(urlOrProvider);
        chain.isRemote = true;
        chain.url = urlOrProvider;
    } else {
        chain.provider = urlOrProvider;
    }
    chain.userWallets = info.userKeys.map((x) => new Wallet(x, chain.provider));
    chain.ownerWallet = new Wallet(info.ownerKey, chain.provider);
    chain.operatorWallet = new Wallet(info.operatorKey, chain.provider);
    chain.relayerWallet = new Wallet(info.relayerKey, chain.provider);
    chain.adminWallets = info.adminKeys.map((x) => new Wallet(x, chain.provider));
    chain.threshold = info.threshold;
    chain.lastRelayedBlock = info.lastRelayedBlock;
    chain.tokens = info.tokens;

    chain.constAddressDeployer = new Contract(info.constAddressDeployerAddress, ConstAddressDeployer.abi, chain.provider);
    chain.gateway = new Contract(info.gatewayAddress, IAxelarGateway.abi, chain.provider);
    chain.gasReceiver = new Contract(info.gasReceiverAddress, IAxelarGasReceiver.abi, chain.provider);
    //chain.usdc = await chain.getTokenContract('aUSDC');

    logger.log(`Its gateway is deployed at ${chain.gateway.address}.`);

    networks.push(chain);
    return chain;
}

/**
 * @returns {[Network]}
 */
export async function getAllNetworks(url: string) {
    const n: number = parseInt((await httpGet(url + '/info')) as string);
    for (let i = 0; i < n; i++) {
        await getNetwork(url + '/' + i);
    }
    return networks;
}

/**
 * @returns {Network}
 */
export async function setupNetwork(urlOrProvider: string | providers.Provider, options: NetworkSetup) {
    const chain = new Network();
    chain.name = options.name != null ? options.name : `Chain ${networks.length + 1}`;
    chain.provider = typeof urlOrProvider === 'string' ? ethers.getDefaultProvider(urlOrProvider) : urlOrProvider;
    chain.chainId = (await chain.provider.getNetwork()).chainId;

    logger.log(`Setting up ${chain.name} on a network with a chainId of ${chain.chainId}...`);
    if (options.userKeys == null) options.userKeys = [];
    if (options.operatorKey == null) options.operatorKey = options.ownerKey;
    if (options.relayerKey == null) options.relayerKey = options.ownerKey;
    if (options.adminKeys == null) options.adminKeys = [options.ownerKey];

    chain.userWallets = options.userKeys.map((x) => new Wallet(x, chain.provider));
    chain.ownerWallet = new Wallet(options.ownerKey, chain.provider);
    chain.operatorWallet = new Wallet(options.operatorKey, chain.provider);
    chain.relayerWallet = new Wallet(options.relayerKey, chain.provider);

    chain.adminWallets = options.adminKeys.map((x) => new Wallet(x, chain.provider));
    chain.threshold = options.threshold != null ? options.threshold : 1;
    chain.lastRelayedBlock = await chain.provider.getBlockNumber();
    await chain._deployConstAddressDeployer();
    await chain._deployGateway();
    await chain._deployGasReceiver();
    chain.tokens = {};
    //chain.usdc = await chain.deployToken('Axelar Wrapped aUSDC', 'aUSDC', 6, BigInt(1e70));
    networks.push(chain);
    return chain;
}

export async function forkNetwork(chainInfo: ChainCloneData, options: NetworkOptions = {}) {
    if (options.dbPath && fs.existsSync(options.dbPath + '/networkInfo.json')) {
        throw new Error('Not supported, bug foivos if you need to fork and archive chains');
    }
    const chain: Network = new Network();
    chain.name = options.name != null ? options.name : chainInfo.name != null ? chainInfo.name : `Chain ${networks.length + 1}`;
    chain.chainId = options.chainId! || chainInfo.chainId! || networks.length + 2500;
    logger.log(`Forking ${chain.name} with a chainId of ${chain.chainId}...`);
    const accounts = defaultAccounts(20, options.seed!);

    //This section gets the admin accounts so we can unlock them in our fork to upgrade the gateway to a 'localized' version
    const forkProvider = getDefaultProvider(chainInfo.rpc);
    const gateway = new Contract(chainInfo.gateway, AxelarGateway.abi, forkProvider);
    const KEY_ADMIN_EPOCH = keccak256(toUtf8Bytes('admin-epoch'));
    const adminEpoch = await gateway.getUint(KEY_ADMIN_EPOCH);
    const PREFIX_ADMIN_THRESHOLD = keccak256(toUtf8Bytes('admin-threshold'));
    const thresholdKey = keccak256(solidityPack(['bytes32', 'uint256'], [PREFIX_ADMIN_THRESHOLD, adminEpoch]));
    const oldThreshold = await gateway.getUint(thresholdKey);
    const oldAdminAddresses: string[] = [];
    for (let i = 0; i < oldThreshold; i++) {
        const PREFIX_ADMIN = keccak256(toUtf8Bytes('admin'));
        const adminKey = keccak256(solidityPack(['bytes32', 'uint256', 'uint256'], [PREFIX_ADMIN, adminEpoch, i]));
        const address = await gateway.getAddress(adminKey);
        oldAdminAddresses.push(address);
    }

    const ganacheOptions = {
        database: { dbPath: options.dbPath },
        wallet: {
            accounts: accounts,
            unlockedAccounts: oldAdminAddresses,
        },
        chain: {
            chainId: chain.chainId,
            networkId: chain.chainId,
            vmErrorsOnRPCResponse: true,
        },
        fork: {
            url: chainInfo.rpc,
        },
        logging: { quiet: true },
    };
    const merged = merge(ganacheOptions, options.ganacheOptions);
    chain.ganacheProvider = require('ganache').provider(merged);
    chain.provider = new providers.Web3Provider(chain.ganacheProvider);
    const wallets = accounts.map((x) => new Wallet(x.secretKey, chain.provider));
    chain.userWallets = wallets.splice(10, 20);
    [chain.ownerWallet, chain.operatorWallet, chain.relayerWallet] = wallets;
    chain.adminWallets = wallets.splice(4, 10);
    chain.threshold = 3;
    chain.lastRelayedBlock = await chain.provider.getBlockNumber();
    chain.constAddressDeployer = new Contract(chainInfo.constAddressDeployer, ConstAddressDeployer.abi, chain.provider);
    chain.gateway = new Contract(chainInfo.gateway, AxelarGateway.abi, chain.provider);
    await chain._upgradeGateway(oldAdminAddresses, oldThreshold);
    chain.gasReceiver = new Contract(chainInfo.gasReceiver, IAxelarGasReceiver.abi, chain.provider);

    chain.tokens = chainInfo.tokens;

    if (options.port) {
        chain.port = options.port;
        chain.server = server(chain).listen(chain.port, () => {
            logger.log(`Serving ${chain.name} on port ${chain.port}`);
        });
    }
    if (options.dbPath) {
        setJSON(chain.getInfo(), options.dbPath + '/networkInfo.json');
    }
    networks.push(chain);
    return chain;
}

export async function stop(network: string | Network) {
    if (typeof network == 'string') network = networks.find((chain) => chain.name == network)!;
    if (network.server != null) await network.server.close();
    networks.splice(networks.indexOf(network), 1);
}

export async function stopAll() {
    while (networks.length > 0) {
        await stop(networks[0]);
    }
    if (serverInstance) {
        await serverInstance.close();
        serverInstance = null;
    }
}

export const depositAddresses: any = {};

export function getDepositAddress(
    from: Network | string,
    to: Network | string,
    destinationAddress: string,
    alias: string,
    port: number | undefined = undefined
) {
    if (typeof from != 'string') from = from.name;
    if (typeof to != 'string') to = to.name;
    if (!port) {
        const key = keccak256(id(from + ':' + to + ':' + destinationAddress + ':' + alias));
        const address = new Wallet(key).address;
        depositAddresses[from] = {
            [address]: {
                destinationChain: to,
                destinationAddress: destinationAddress,
                alias: alias,
                privateKey: key,
            },
        };
        return address;
    }
    return httpGet(`http:/localhost:${port}/getDepositAddress/${from}/${to}/${destinationAddress}/${alias}`);
}
