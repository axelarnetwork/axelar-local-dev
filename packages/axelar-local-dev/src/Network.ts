'use strict';

import { ethers, Wallet, Contract, providers } from 'ethers';
import { logger } from './utils';
import { getSignedExecuteInput, getRandomID, deployContract } from './utils';
import {
    AxelarGatewayProxy,
    Auth,
    TokenDeployer,
    BurnableMintableCappedERC20,
    AxelarGasReceiverProxy,
    ConstAddressDeployer,
    Create3Deployer,
} from './contracts';
import { AxelarGateway__factory as AxelarGatewayFactory } from './types/factories/@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway__factory';
import { AxelarGateway } from './types/@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway';
import { AxelarGasService__factory as AxelarGasServiceFactory } from './types/factories/@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasService__factory';
import { AxelarGasService } from './types/@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasService';
import http from 'http';

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const { defaultAbiCoder, arrayify, keccak256, toUtf8Bytes } = ethers.utils;

export const networks: Network[] = [];
export interface NetworkOptions {
    ganacheOptions?: any;
    dbPath?: string;
    port?: number;
    name?: string;
    chainId?: number;
    seed?: string;
}

export interface NetworkInfo {
    name: string;
    chainId: number;
    userKeys: string[];
    ownerKey: string;
    operatorKey: string;
    relayerKey: string;
    adminKeys: string[];
    threshold: number;
    lastRelayedBlock: number;
    lastExpressedBlock: number;
    gatewayAddress: string;
    gasReceiverAddress: string;
    constAddressDeployerAddress: string;
    create3DeployerAddress: string;
    tokens: { [key: string]: string };
}
export interface NetworkSetup {
    name?: string;
    chainId?: number;
    userKeys?: Wallet[];
    ownerKey: Wallet;
    operatorKey?: Wallet;
    relayerKey?: Wallet;
    adminKeys?: Wallet[];
    threshold?: number;
    lastRelayedBlock?: number;
    lastExpressedBlock?: number;
}

/*
 * The Network class
 */
export class Network {
    name: string;
    chainId: number;
    provider: providers.Provider;
    userWallets: Wallet[];
    ownerWallet: Wallet;
    operatorWallet: Wallet;
    relayerWallet: Wallet;
    adminWallets: Wallet[];
    threshold: number;
    lastRelayedBlock: number;
    lastExpressedBlock: number;
    gateway: AxelarGateway;
    gasService: AxelarGasService;
    constAddressDeployer: Contract;
    create3Deployer: Contract;
    isRemote: boolean | undefined;
    url: string | undefined;
    ganacheProvider: any;
    server: http.Server | undefined;
    port: number | undefined;
    tokens: { [key: string]: string };
    constructor(networkish: any = {}) {
        this.name = networkish.name;
        this.chainId = networkish.chainId;
        this.provider = networkish.provider;
        this.userWallets = networkish.userWallets;
        this.ownerWallet = networkish.ownerWallet;
        this.operatorWallet = networkish.operatorWallet;
        this.relayerWallet = networkish.relayerWallet;
        this.adminWallets = networkish.adminWallets;
        this.threshold = networkish.threshold;
        this.lastRelayedBlock = networkish.lastRelayedBlock;
        this.lastExpressedBlock = networkish.lastExpressedBlock;
        this.gateway = networkish.gateway;
        this.gasService = networkish.gasService;
        this.constAddressDeployer = networkish.constAddressDeployer;
        this.create3Deployer = networkish.create3Deployer;
        this.isRemote = networkish.isRemote;
        this.url = networkish.url;
        this.tokens = networkish.tokens;
    }
    async deployGateway(): Promise<Contract> {
        logger.log(`Deploying the Axelar Gateway for ${this.name}... `);

        const params = arrayify(
            defaultAbiCoder.encode(
                ['address[]', 'uint8', 'bytes'],
                [this.adminWallets.map((wallet) => wallet.address), this.threshold, '0x']
            )
        );
        const auth = await deployContract(this.ownerWallet, Auth, [
            [defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [[this.operatorWallet.address], [1], 1])],
        ]);
        const tokenDeployer = await deployContract(this.ownerWallet, TokenDeployer);
        const gateway = await deployContract(this.ownerWallet, AxelarGatewayFactory, [auth.address, tokenDeployer.address]);
        const proxy = await deployContract(this.ownerWallet, AxelarGatewayProxy, [gateway.address, params]);
        await (await auth.transferOwnership(proxy.address)).wait();
        this.gateway = AxelarGatewayFactory.connect(proxy.address, this.provider);
        logger.log(`Deployed at ${this.gateway.address}`);
        return this.gateway;
    }

    async _upgradeGateway(oldAdminAddresses: string[] | undefined = undefined, oldThreshold: number = this.threshold): Promise<Contract> {
        const adminWallets =
            oldAdminAddresses !== undefined
                ? oldAdminAddresses.map((address: string) => (this.provider as any).getSigner(address))
                : this.adminWallets;

        logger.log(`Upgrading the Axelar Gateway for ${this.name}... `);

        const params = arrayify(
            defaultAbiCoder.encode(
                ['address[]', 'uint256', 'bytes'],
                [this.adminWallets.map((wallet) => wallet.address), this.threshold, '0x']
            )
        );
        const auth = await deployContract(this.ownerWallet, Auth, [
            [defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [[this.operatorWallet.address], [1], 1])],
        ]);
        const tokenDeployer = await deployContract(this.ownerWallet, TokenDeployer);
        const gateway = await deployContract(this.ownerWallet, AxelarGatewayFactory, [auth.address, tokenDeployer.address]);
        const implementationCode = await this.provider.getCode(gateway.address);
        const implementationCodeHash = keccak256(implementationCode);
        for (let i = 0; i < oldThreshold; i++) {
            await (await this.ownerWallet.sendTransaction({ to: adminWallets[i]._address, value: BigInt(1e18) })).wait();
            await (await this.gateway.connect(adminWallets[i]).upgrade(gateway.address, implementationCodeHash, params)).wait();
        }
        await (await auth.transferOwnership(this.gateway.address)).wait();
        logger.log(`Upgraded ${this.gateway.address}`);
        return this.gateway;
    }
    async deployGasReceiver(): Promise<Contract> {
        logger.log(`Deploying the Axelar Gas Receiver for ${this.name}... `);
        const gasService = await deployContract(this.ownerWallet, AxelarGasServiceFactory, [this.ownerWallet.address]);
        const gasReceiverProxy = await deployContract(this.ownerWallet, AxelarGasReceiverProxy);
        await gasReceiverProxy.init(gasService.address, this.ownerWallet.address, '0x');

        this.gasService = AxelarGasServiceFactory.connect(gasReceiverProxy.address, this.provider);
        logger.log(`Deployed at ${this.gasService.address}`);
        return this.gasService;
    }
    async deployConstAddressDeployer(): Promise<Contract> {
        logger.log(`Deploying the ConstAddressDeployer for ${this.name}... `);
        const constAddressDeployerDeployerPrivateKey = keccak256(toUtf8Bytes('const-address-deployer-deployer'));
        const deployerWallet = new Wallet(constAddressDeployerDeployerPrivateKey, this.provider);
        await this.ownerWallet
            .sendTransaction({
                to: deployerWallet.address,
                value: BigInt(1e18),
            })
            .then((tx) => tx.wait());
        const constAddressDeployer = await deployContract(deployerWallet, ConstAddressDeployer, []);

        this.constAddressDeployer = new Contract(constAddressDeployer.address, ConstAddressDeployer.abi, this.provider);
        logger.log(`Deployed at ${this.constAddressDeployer.address}`);
        return this.constAddressDeployer;
    }
    async deployCreate3Deployer(): Promise<Contract> {
        logger.log(`Deploying the ConstAddressDeployer for ${this.name}... `);
        const create3DeployerPrivateKey = keccak256(toUtf8Bytes('const-address-deployer-deployer'));
        const deployerWallet = new Wallet(create3DeployerPrivateKey, this.provider);
        await this.ownerWallet
            .sendTransaction({
                to: deployerWallet.address,
                value: BigInt(1e18),
            })
            .then((tx) => tx.wait());
        const create3Deployer = await deployContract(deployerWallet, Create3Deployer, []);

        this.create3Deployer = new Contract(create3Deployer.address, Create3Deployer.abi, this.provider);
        logger.log(`Deployed at ${this.constAddressDeployer.address}`);
        return this.create3Deployer;
    }

    async deployToken(name: string, symbol: string, decimals: number, cap: bigint, address: string = ADDRESS_ZERO, alias: string = symbol) {
        logger.log(`Deploying ${name} for ${this.name}... `);
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    this.chainId,
                    [getRandomID()],
                    ['deployToken'],
                    [
                        defaultAbiCoder.encode(
                            ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
                            [name, symbol, decimals, cap, address, 0]
                        ),
                    ],
                ]
            )
        );
        const signedData = await getSignedExecuteInput(data, this.operatorWallet);
        await (await this.gateway.connect(this.ownerWallet).execute(signedData, { gasLimit: BigInt(8e6) })).wait();
        const tokenAddress = await this.gateway.tokenAddresses(symbol);
        const tokenContract = new Contract(tokenAddress, BurnableMintableCappedERC20.abi, this.ownerWallet);
        logger.log(`Deployed at ${tokenContract.address}`);
        this.tokens[alias] = symbol;
        return tokenContract;
    }

    async getTokenContract(alias: string) {
        const symbol = this.tokens[alias];
        const address = await this.gateway.tokenAddresses(symbol);
        return new Contract(address, BurnableMintableCappedERC20.abi, this.provider);
    }

    async giveToken(address: string, alias: string, amount: bigint) {
        const symbol = this.tokens[alias] || alias;
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    this.chainId,
                    [getRandomID()],
                    ['mintToken'],
                    [defaultAbiCoder.encode(['string', 'address', 'uint256'], [symbol, address, amount])],
                ]
            )
        );

        const signedData = await getSignedExecuteInput(data, this.operatorWallet);
        await (await this.gateway.connect(this.ownerWallet).execute(signedData, { gasLimit: BigInt(8e6) })).wait();
    }

    getInfo() {
        const info: NetworkInfo = {
            name: this.name,
            chainId: this.chainId,
            userKeys: this.userWallets.map((wallet) => wallet.privateKey),
            ownerKey: this.ownerWallet.privateKey,
            operatorKey: this.operatorWallet.privateKey,
            relayerKey: this.relayerWallet.privateKey,
            adminKeys: this.adminWallets.map((wallet) => wallet.privateKey),
            threshold: this.threshold,
            lastRelayedBlock: this.lastRelayedBlock,
            lastExpressedBlock: this.lastExpressedBlock,
            gatewayAddress: this.gateway.address,
            gasReceiverAddress: this.gasService.address,
            constAddressDeployerAddress: this.constAddressDeployer.address,
            create3DeployerAddress: this.create3Deployer.address,
            tokens: this.tokens,
        };
        return info;
    }

    getCloneInfo() {
        return {
            name: this.name,
            chainId: this.chainId,
            gateway: this.gateway.address,
            gasService: this.gasService.address,
            constAddressDeployer: this.constAddressDeployer.address,
            create3Deployer: this.create3Deployer.address,
            tokens: this.tokens,
        };
    }
}

export class RemoteNetwork extends Network {
    async relay() {
        await new Promise((resolve: (value: unknown) => void, reject: (value: unknown) => void) => {
            http.get(this.url + '/relay', (res: http.IncomingMessage) => {
                const { statusCode } = res;
                if (statusCode !== 200) {
                    reject(null);
                }
                res.on('data', (chunk) => {});
                res.on('end', () => {
                    resolve(null);
                });
            });
        });
    }
}
