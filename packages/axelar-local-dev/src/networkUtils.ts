'use strict';

import server from './server';
import fs from 'fs';
import { ethers, Wallet, Contract, providers, getDefaultProvider } from 'ethers';
import { defaultAccounts, setJSON, httpGet, logger, isBlockOutOfRangeMessage } from './utils';
import { Network, networks, NetworkOptions, NetworkInfo, NetworkSetup } from './Network';
import { AxelarGateway__factory as AxelarGatewayFactory } from './types/factories/@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway__factory';
import { AxelarGasService__factory as AxelarGasServiceFactory } from './types/factories/@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasService__factory';
import { Server } from 'http';
import { ConstAddressDeployer, Create3Deployer, IInterchainTokenService } from './contracts';
import {
    InterchainTokenService__factory as InterchainTokenServiceFactory,
    InterchainTokenFactory__factory as InterchainTokenFactoryFactory,
} from './types/factories/@axelar-network/interchain-token-service/contracts';
import { setupITS } from './its';
import { AnvilBackend } from './anvil';

const { keccak256, solidityPack, toUtf8Bytes } = ethers.utils;

const DEFAULT_POLLING_INTERVAL_MS = 500;

let serverInstance: Server | undefined;

/**
 * Fund the deterministic default accounts on the anvil node. The wallets sign
 * locally (ethers Wallet), so anvil only needs the addresses to hold a balance.
 */
async function fundAccounts(provider: providers.JsonRpcProvider, accounts: { balance: bigint; secretKey: string }[]): Promise<void> {
    await Promise.all(
        accounts.map((account) =>
            provider.send('anvil_setBalance', [
                new Wallet(account.secretKey).address,
                ethers.utils.hexValue(ethers.BigNumber.from(account.balance)),
            ])
        )
    );
}

/**
 * Create a JsonRpcProvider for an anvil node: sets the polling interval used by
 * the relayer's event subscriptions, and installs a ganache-compatibility shim.
 *
 * anvil is stricter than the old ganache backend about eth_getLogs — it rejects a
 * range whose fromBlock is past the current chain height (e.g. fromBlock > toBlock,
 * which ethers' event-filter polling transiently requests when no new block has
 * been mined). ganache returned [] for such ranges; we emulate that so the
 * relayer's `.on(...)` log subscriptions don't crash on a benign empty range.
 */
function createAnvilProvider(url: string): providers.JsonRpcProvider {
    const provider = new providers.JsonRpcProvider(url);
    provider.pollingInterval = DEFAULT_POLLING_INTERVAL_MS;
    const send = provider.send.bind(provider);
    provider.send = async (method: string, params: Array<any>): Promise<any> => {
        try {
            return await send(method, params);
        } catch (error) {
            if (method === 'eth_getLogs' && isBlockOutOfRangeError(error)) return [];
            throw error;
        }
    };
    return provider;
}

function isBlockOutOfRangeError(error: any): boolean {
    return isBlockOutOfRangeMessage(`${error?.error?.message ?? ''} ${error?.body ?? ''} ${error?.message ?? ''}`);
}

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
        const backend = new AnvilBackend({
            ...options.anvilOptions,
            chainId: info.chainId,
            statePath: `${options.dbPath}/anvil-state.json`,
        });
        await backend.start();
        const provider = createAnvilProvider(backend.url);
        const chain = await getNetwork(provider, info);
        chain.anvil = backend;
        chain.anvilUrl = backend.url;
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

    const backend = new AnvilBackend({
        ...options.anvilOptions,
        chainId: chain.chainId,
        statePath: options.dbPath ? `${options.dbPath}/anvil-state.json` : options.anvilOptions?.statePath,
    });
    await backend.start();
    chain.anvil = backend;
    chain.anvilUrl = backend.url;
    chain.provider = createAnvilProvider(backend.url);
    await fundAccounts(chain.provider as providers.JsonRpcProvider, accounts);
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
    await chain.deployInterchainTokenService();
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
    chain.interchainTokenService = InterchainTokenServiceFactory.connect(info.InterchainTokenService, chain.provider);
    chain.interchainTokenFactory = InterchainTokenFactoryFactory.connect(info.InterchainTokenFactory, chain.provider);
    await setupITS(chain);

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

function getDefaultLocalWallets() {
    // This is a default seed for anvil that generates 10 wallets
    const defaultSeed = 'test test test test test test test test test test test junk';

    const wallets = [];

    for (let i = 0; i < 10; i++) {
        wallets.push(Wallet.fromMnemonic(defaultSeed, `m/44'/60'/0'/0/${i}`));
    }

    return wallets;
}

/**
 * @returns {Network}
 */
export async function setupNetwork(urlOrProvider: string | providers.Provider, options: NetworkSetup) {
    const chain = new Network();

    chain.name = options.name != null ? options.name : `Chain ${networks.length + 1}`;
    chain.provider = typeof urlOrProvider === 'string' ? ethers.getDefaultProvider(urlOrProvider) : urlOrProvider;
    chain.chainId = (await chain.provider.getNetwork()).chainId;

    const defaultWalelts = getDefaultLocalWallets();

    logger.log(`Setting up ${chain.name} on a network with a chainId of ${chain.chainId}...`);
    if (options.userKeys == null) options.userKeys = options.userKeys || defaultWalelts.slice(5, 10);
    if (options.relayerKey == null) options.relayerKey = options.ownerKey || defaultWalelts[2];
    if (options.operatorKey == null) options.operatorKey = options.ownerKey || defaultWalelts[3];
    if (options.adminKeys == null) options.adminKeys = options.ownerKey ? [options.ownerKey] : [defaultWalelts[4]];

    options.ownerKey = options.ownerKey || defaultWalelts[0];

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
    await chain.deployInterchainTokenService();
    chain.tokens = {};
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

    const backend = new AnvilBackend({
        ...options.anvilOptions,
        chainId: chain.chainId,
        forkUrl: chainInfo.rpc,
        unlockedAccounts: [...oldAdminAddresses, ...(options.anvilOptions?.unlockedAccounts ?? [])],
        statePath: options.dbPath ? `${options.dbPath}/anvil-state.json` : options.anvilOptions?.statePath,
    });
    await backend.start();
    chain.anvil = backend;
    chain.anvilUrl = backend.url;
    chain.provider = createAnvilProvider(backend.url);
    await fundAccounts(chain.provider as providers.JsonRpcProvider, accounts);
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
    await chain.deployInterchainTokenService();

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
    if (typeof network === 'string') network = networks.find((chain) => chain.name === network)!;
    if (network.server) await network.server.close();
    await network.anvil?.stop();
    networks.splice(networks.indexOf(network), 1);
}

export async function stopAll() {
    while (networks.length > 0) {
        await stop(networks[0]);
    }
    if (serverInstance) {
        await serverInstance.close();
        serverInstance = undefined;
    }
}
