'use strict';

import { ethers, Wallet, Contract, providers } from 'ethers';
import { logger } from './utils';
const { defaultAbiCoder, arrayify, keccak256, toUtf8Bytes } = ethers.utils;
const { getSignedExecuteInput, getRandomID, deployContract } = require('./utils');
import http from 'http';

const TokenDeployer = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/TokenDeployer.sol/TokenDeployer.json');
const AxelarGatewayProxy = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/AxelarGatewayProxy.sol/AxelarGatewayProxy.json');
const AxelarGateway = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/AxelarGateway.sol/AxelarGateway.json');
const IAxelarGateway = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarGateway.sol/IAxelarGateway.json');
const BurnableMintableCappedERC20 = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/BurnableMintableCappedERC20.sol/BurnableMintableCappedERC20.json');
const Auth = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/AxelarAuthMultisig.sol/AxelarAuthMultisig.json');
const AxelarGasReceiver = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const AxelarGasReceiverProxy = require('../artifacts/@axelar-network/axelar-cgp-solidity/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');
const ConstAddressDeployer = require('axelar-utils-solidity/dist/ConstAddressDeployer.json');

const ROLE_OWNER = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

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
    gatewayAddress: string;
    gasReceiverAddress: string;
    constAddressDeployerAddress: string;
    tokens: { [key: string]: string };
}
export interface NetworkSetup {
    name: string | undefined;
    chainId: number | undefined;
    userKeys: Wallet[] | undefined;
    ownerKey: Wallet;
    operatorKey: Wallet | undefined;
    relayerKey: Wallet | undefined;
    adminKeys: Wallet[] | undefined;
    threshold: number | undefined;
    lastRelayedBlock: number | undefined;
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
    gateway: Contract;
    gasReceiver: Contract;
    constAddressDeployer: Contract;
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
        this.gateway = networkish.gateway;
        this.gasReceiver = networkish.gasReceiver;
        this.constAddressDeployer = networkish.constAddressDeployer;
        this.isRemote = networkish.isRemote;
        this.url = networkish.url;
        this.tokens = networkish.tokens;
    }
    async _deployGateway(): Promise<Contract> {
        logger.log(`Deploying the Axelar Gateway for ${this.name}... `);

        const params = arrayify(
            defaultAbiCoder.encode(
                ['address[]', 'uint8', 'bytes'],
                [this.adminWallets.map((wallet) => wallet.address), this.threshold, '0x']
            )
        );
        const auth = await deployContract(this.ownerWallet, Auth, [
            [defaultAbiCoder.encode(['address[]', 'uint256'], [[this.operatorWallet.address], 1])],
        ]);
        const tokenDeployer = await deployContract(this.ownerWallet, TokenDeployer);
        const gateway = await deployContract(this.ownerWallet, AxelarGateway, [auth.address, tokenDeployer.address]);
        const proxy = await deployContract(this.ownerWallet, AxelarGatewayProxy, [gateway.address, params]);
        await (await auth.transferOwnership(proxy.address)).wait();
        this.gateway = new Contract(proxy.address, IAxelarGateway.abi, this.provider);
        logger.log(`Deployed at ${this.gateway.address}`);
        return this.gateway;
    }

    async _upgradeGateway(oldAdminAddresses: string[] | undefined = undefined, oldThreshold: number = this.threshold): Promise<Contract> {
        const adminWallets =
            oldAdminAddresses != undefined
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
            [defaultAbiCoder.encode(['address[]', 'uint256'], [[this.operatorWallet.address], 1])],
        ]);
        const tokenDeployer = await deployContract(this.ownerWallet, TokenDeployer);
        const gateway = await deployContract(this.ownerWallet, AxelarGateway, [auth.address, tokenDeployer.address]);
        const implementationCode = await this.provider.getCode(gateway.address);
        const implementationCodeHash = keccak256(implementationCode);
        for (let i = 0; i < oldThreshold; i++) {
            await (await this.gateway.connect(adminWallets[i]).upgrade(gateway.address, implementationCodeHash, params)).wait();
        }
        await (await auth.transferOwnership(this.gateway.address)).wait();
        logger.log(`Upgraded ${this.gateway.address}`);
        return this.gateway;
    }
    async _deployGasReceiver(): Promise<Contract> {
        logger.log(`Deploying the Axelar Gas Receiver for ${this.name}... `);
        const gasReceiver = await deployContract(this.ownerWallet, AxelarGasReceiver, []);
        const gasReceiverProxy = await deployContract(this.ownerWallet, AxelarGasReceiverProxy, [
            gasReceiver.address,
            defaultAbiCoder.encode(['address', 'address'], [this.ownerWallet.address, this.gateway.address]),
        ]);

        this.gasReceiver = new Contract(gasReceiverProxy.address, AxelarGasReceiver.abi, this.provider);
        logger.log(`Deployed at ${this.gasReceiver.address}`);
        return this.gasReceiver;
    }
    async _deployConstAddressDeployer(): Promise<Contract> {
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
    async deployToken(name: string, symbol: string, decimals: number, cap: BigInt, alias: string = symbol, address: string = ADDRESS_ZERO) {
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
        await (await this.gateway.connect(this.ownerWallet).execute(signedData, { gasLimit: BigInt(1e7) })).wait();
        let tokenAddress = await this.gateway.tokenAddresses(symbol);
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
    async giveToken(address: string, alias: string, amount: BigInt) {
        const symbol = this.tokens[alias];
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    this.chainId,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['mintToken'],
                    [defaultAbiCoder.encode(['string', 'address', 'uint256'], [symbol, address, amount])],
                ]
            )
        );

        const signedData = await getSignedExecuteInput(data, this.operatorWallet);
        await (await this.gateway.connect(this.ownerWallet).execute(signedData, { gasLimit: BigInt(1e7) })).wait();
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
            gatewayAddress: this.gateway.address,
            gasReceiverAddress: this.gasReceiver.address,
            constAddressDeployerAddress: this.constAddressDeployer.address,
            tokens: this.tokens,
        };
        return info;
    }

    getCloneInfo() {
        return {
            name: this.name,
            chainId: this.chainId,
            gateway: this.gateway.address,
            gasReceiver: this.gasReceiver.address,
            constAddressDeployer: this.constAddressDeployer.address,
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
