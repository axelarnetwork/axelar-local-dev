'use strict';

import server from './server';
import ganache from 'ganache';
import fs from 'fs';
import { ethers, Wallet, Contract, providers, getDefaultProvider } from 'ethers';
import { merge } from 'lodash';
import { defaultAccounts, setJSON, httpGet, logger } from './utils';
import { Network, networks, NetworkOptions, NetworkInfo, NetworkSetup } from './Network';
import { AxelarGateway__factory as AxelarGatewayFactory } from './types/factories/@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway__factory';
import { AxelarGasService__factory as AxelarGasServiceFactory } from './types/factories/@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasService__factory';
import { ConstAddressDeployer, Create3Deployer } from './contracts';

const { keccak256, id, solidityPack, toUtf8Bytes } = ethers.utils;

let serverInstance: any;

export interface ChainCloneData {
    name: string;
    gateway: string;
    rpc: string;
    chainId: number;
    constAddressDeployer: string;
    create3Deployer: string;
    tokenName: string;
    tokenSymbol: string;
    gasService: string;
    AxelarGasService: {
        address: string;
    };
    AxelarDepositService: {
        address: string;
    };
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

export async function createNetwork(options: NetworkOptions = {}) {
    if (options.dbPath && fs.existsSync(options.dbPath + '/networkInfo.json')) {
        const info = require(options.dbPath + '/networkInfo.json');
        const ganacheOptions = {
            database: { dbPath: options.dbPath },
            ...options.ganacheOptions,
            chain: {
                vmErrorsOnRPCResponse: true,
                chainId: info.chainId,
                networkId: info.chainId,
            },
            logging: { quiet: true },
        };
        merge(ganacheOptions, options.ganacheOptions);
        const ganacheProvider = ganache.provider(ganacheOptions) as any;
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
    chain.chainId = options.chainId! || networks.length + 2500;
    logger.log(`Creating ${chain.name} with a chainId of ${chain.chainId}...`);
    const accounts = defaultAccounts(20, options.seed!);

    const ganacheOptions = {
        database: { dbPath: options.dbPath },
        wallet: {
            accounts: accounts,
        },
        chain: {
            chainId: chain.chainId,
            networkId: chain.chainId,
            vmErrorsOnRPCResponse: true,
        },
        logging: { quiet: true },
    };
    merge(ganacheOptions, options.ganacheOptions);
    chain.ganacheProvider = ganache.provider(ganacheOptions);
    chain.provider = new providers.Web3Provider(chain.ganacheProvider);
    const wallets = accounts.map((x) => new Wallet(x.secretKey, chain.provider));
    chain.userWallets = wallets.splice(10, 20);
    [chain.ownerWallet, chain.operatorWallet, chain.relayerWallet] = wallets;
    chain.adminWallets = wallets.splice(4, 10);
    chain.threshold = 3;
    chain.lastRelayedBlock = await chain.provider.getBlockNumber();
    chain.lastExpressedBlock = chain.lastRelayedBlock;
    await chain.deployConstAddressDeployer();
    await chain.deployCreate3Deployer();
    await chain.deployGateway();
    await chain.deployGasReceiver();
    chain.tokens = {};
    //chain.usdc = await chain.deployToken('Axelar Wrapped aUSDC', 'aUSDC', 6, BigInt(1e70));

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
    chain.lastExpressedBlock = info.lastExpressedBlock;
    chain.tokens = info.tokens;

    chain.constAddressDeployer = new Contract(info.constAddressDeployerAddress, ConstAddressDeployer.abi, chain.provider);
    chain.create3Deployer = new Contract(info.create3DeployerAddress, Create3Deployer.abi, chain.provider);
    chain.gateway = AxelarGatewayFactory.connect(info.gatewayAddress, chain.provider);
    chain.gasService = AxelarGasServiceFactory.connect(info.gasReceiverAddress, chain.provider);
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
    chain.lastExpressedBlock = chain.lastRelayedBlock;
    await chain.deployConstAddressDeployer();
    await chain.deployCreate3Deployer();
    await chain.deployGateway();
    await chain.deployGasReceiver();
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
    chain.chainId = options.chainId || chainInfo.chainId || networks.length + 2500;
    logger.log(`Forking ${chain.name} with a chainId of ${chain.chainId}...`);
    const accounts = defaultAccounts(20, options.seed);

    //This section gets the admin accounts so we can unlock them in our fork to upgrade the gateway to a 'localized' version
    const forkProvider = getDefaultProvider(chainInfo.rpc);
    const gateway = AxelarGatewayFactory.connect(chainInfo.gateway, forkProvider);
    const KEY_ADMIN_EPOCH = keccak256(toUtf8Bytes('admin-epoch'));
    const adminEpoch = await gateway.getUint(KEY_ADMIN_EPOCH);
    const PREFIX_ADMIN_THRESHOLD = keccak256(toUtf8Bytes('admin-threshold'));
    const thresholdKey = keccak256(solidityPack(['bytes32', 'uint256'], [PREFIX_ADMIN_THRESHOLD, adminEpoch]));
    const oldThreshold = await gateway.getUint(thresholdKey).then((x) => x.toNumber());
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
    chain.ganacheProvider = ganache.provider(merged);
    chain.provider = new providers.Web3Provider(chain.ganacheProvider);
    const wallets = accounts.map((x) => new Wallet(x.secretKey, chain.provider));
    chain.userWallets = wallets.splice(10, 20);
    [chain.ownerWallet, chain.operatorWallet, chain.relayerWallet] = wallets;
    chain.adminWallets = wallets.splice(4, 10);
    chain.threshold = 3;
    chain.lastRelayedBlock = await chain.provider.getBlockNumber();
    chain.lastExpressedBlock = chain.lastRelayedBlock;
    chain.constAddressDeployer = new Contract(chainInfo.constAddressDeployer, ConstAddressDeployer.abi, chain.provider);
    // Delete the line below and uncomment the line after when we deploy create3Deployer
    await chain.deployCreate3Deployer();
    //chain.create3Deployer = new Contract(chainInfo.create3Deployer, Create3Deployer.abi, chain.provider);
    chain.gateway = AxelarGatewayFactory.connect(chainInfo.gateway, chain.provider);
    await chain._upgradeGateway(oldAdminAddresses, oldThreshold);
    chain.gasService = AxelarGasServiceFactory.connect(chainInfo.AxelarGasService.address, chain.provider);

    chain.tokens = {
        uusdc: chain.name === 'Ethereum' ? 'USDC' : 'axlUSDC',
        uausdc: 'aUSDC',
    };

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
    if (typeof network === 'string') network = networks.find((chain) => chain.name == network)!;
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
