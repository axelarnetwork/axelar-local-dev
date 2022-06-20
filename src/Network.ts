'use strict';

import {
    ethers,
    Wallet,
    Contract,
    ContractFactory,
    providers,
} from 'ethers';
import { logger } from './utils';
const {
    defaultAbiCoder,
    arrayify, 
    keccak256, 
    toUtf8Bytes,
} = ethers.utils;
const {
    getSignedExecuteInput,
    getRandomID,
    deployContract,
} = require('./utils');
import http from 'http';

const TokenDeployer = require('../build/TokenDeployer.json');
const AxelarGatewayProxy = require('../build/AxelarGatewayProxy.json');
const AxelarGatewaySinglesig = require('../build/AxelarGatewaySinglesig.json');
const IAxelarGateway = require('../build/IAxelarGateway.json');
const BurnableMintableCappedERC20 = require('../build/BurnableMintableCappedERC20.json');
const AxelarGasReceiver = require('../build/AxelarGasReceiver.json');
const AxelarGasReceiverProxy = require('../build/AxelarGasReceiverProxy.json');
const ConstAddressDeployer = require('axelar-utils-solidity/dist/ConstAddressDeployer.json');

const ROLE_OWNER = 1;
const ROLE_OPERATOR = 2;
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
    name: string,
    chainId: number,
    userKeys: string[],
    ownerKey: string,
    operatorKey: string,
    relayerKey: string,
    adminKeys: string[],
    threshold: number,
    lastRelayedBlock: number,
    gatewayAddress: string,
    usdcAddress: string,
    gasReceiverAddress: string,
    constAddressDeployerAddress: string,
}
export interface NetworkSetup {
    name: string | undefined,
    chainId: number | undefined,
    userKeys: Wallet[] | undefined,
    ownerKey: Wallet,
    operatorKey: Wallet | undefined,
    relayerKey: Wallet | undefined,
    adminKeys: Wallet[] | undefined,
    threshold: number | undefined,
    lastRelayedBlock: number | undefined,
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
    lastRelayedBlock : number;
    gateway : Contract;
    gasReceiver : Contract;
    constAddressDeployer : Contract;
    usdc : Contract;
    isRemote: boolean | undefined;
    url: string | undefined;
    ganacheProvider: any;
    server: http.Server | undefined;
    port: number | undefined;
    constructor(
        networkish : any = {}
    ) {
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
        this.usdc = networkish.usdc;
        this.isRemote = networkish.isRemote;
        this.url = networkish.url;
    }
    async _deployGateway(): Promise<Contract> {
        logger.log(`Deploying the Axelar Gateway for ${this.name}... `);
        const params = arrayify(defaultAbiCoder.encode(
            ['address[]', 'uint8', 'address', 'address'],
            [
                this.adminWallets.map(wallet => wallet.address),
                this.threshold,
                this.ownerWallet.address,
                this.operatorWallet.address,
            ],
        ));
        let tokenDeployer = await deployContract(this.ownerWallet, TokenDeployer);
        const gateway = await deployContract(this.ownerWallet, AxelarGatewaySinglesig, [
            tokenDeployer.address,
        ]);
        const proxy = await deployContract(this.ownerWallet, AxelarGatewayProxy, [
            gateway.address,
            params,
        ]);
        this.gateway = new Contract(
            proxy.address,
            IAxelarGateway.abi,
            this.provider,
        );
        logger.log(`Deployed at ${this.gateway.address}`);
        return this.gateway;

    }
    async _deployGasReceiver(): Promise<Contract> {
        logger.log(`Deploying the Axelar Gas Receiver for ${this.name}... `);
        const gasReceiver = await deployContract(this.ownerWallet, AxelarGasReceiver, []);
        const gasReceiverProxy = await deployContract(this.ownerWallet, AxelarGasReceiverProxy, [
            gasReceiver.address,
            defaultAbiCoder.encode(['address', 'address'], [this.ownerWallet.address, this.gateway.address]),
        ]);

        this.gasReceiver = new Contract(
            gasReceiverProxy.address,
            AxelarGasReceiver.abi,
            this.provider,
        );
        logger.log(`Deployed at ${this.gasReceiver.address}`);
        return this.gasReceiver;

    }
    async _deployConstAddressDeployer(): Promise<Contract> {
        logger.log(`Deploying the ConstAddressDeployer for ${this.name}... `);
        const constAddressDeployerDeployerPrivateKey = keccak256(toUtf8Bytes('const-address-deployer-deployer'));
        const deployerWallet = new Wallet(constAddressDeployerDeployerPrivateKey, this.provider);
        await this.ownerWallet.sendTransaction({
            to: deployerWallet.address,
            value: BigInt(1e18),
        }).then(tx => tx.wait());
        const constAddressDeployer = await deployContract(deployerWallet, ConstAddressDeployer, []);

        this.constAddressDeployer = new Contract(
            constAddressDeployer.address,
            ConstAddressDeployer.abi,
            this.provider,
        );
        logger.log(`Deployed at ${this.constAddressDeployer.address}`);
        return this.constAddressDeployer;

    }
    /**
     * @returns {Contract}
     */
    async deployToken (name: string, symbol: string, decimals: number, cap: BigInt, address: string = ADDRESS_ZERO) {
        logger.log(`Deploying ${name} for ${this.name}... `);
        const data = arrayify(defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
                this.chainId,
                ROLE_OWNER,
                [getRandomID()],
                ['deployToken'],
                [defaultAbiCoder.encode(
                    ['string', 'string', 'uint8', 'uint256', 'address'],
                    [name, symbol, decimals, cap, address],
                )],
            ],
        ));

        const signedData = await getSignedExecuteInput(data, this.ownerWallet);
        await (await this.gateway.connect(this.ownerWallet).execute(signedData, {gasLimit: BigInt(1e7)})).wait();
        let tokenAddress = await this.gateway.tokenAddresses(symbol);
        const tokenContract = new Contract(
            tokenAddress,
            BurnableMintableCappedERC20.abi,
            this.ownerWallet,
        );
        logger.log(`Deployed at ${tokenContract.address}`);
        return tokenContract;
    }
    async getTokenContract(symbol: string) {
        const address = await this.gateway.tokenAddresses(symbol);
        return new Contract(
            address,
            BurnableMintableCappedERC20.abi,
            this.provider
        );
    }
    async giveToken(address: string, symbol: string, amount: BigInt) {
        const data = arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    this.chainId,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['mintToken'],
                    [
                        defaultAbiCoder.encode(
                        ['string', 'address', 'uint256'],
                        [symbol, address, amount],
                        ),
                    ],
                ],
            ),
        );

        const signedData = await getSignedExecuteInput(data, this.ownerWallet);
        await (await this.gateway.connect(this.ownerWallet).execute(signedData)).wait();
    }

    getInfo() {
        const info: NetworkInfo = {
            name: this.name,
            chainId: this.chainId,
            userKeys: this.userWallets.map(wallet=>wallet.privateKey),
            ownerKey: this.ownerWallet.privateKey,
            operatorKey: this.operatorWallet.privateKey,
            relayerKey: this.relayerWallet.privateKey,
            adminKeys: this.adminWallets.map(wallet=>wallet.privateKey),
            threshold: this.threshold,
            lastRelayedBlock: this.lastRelayedBlock,
            gatewayAddress: this.gateway.address,
            usdcAddress: this.usdc.address,
            gasReceiverAddress: this.gasReceiver.address,
            constAddressDeployerAddress: this.constAddressDeployer.address,
        }
        return info;
    }
}

export class RemoteNetwork extends Network{
    async relay() {
        await new Promise((resolve: (value: unknown) => void, reject: (value: unknown) => void) => {
            http.get(this.url + '/relay', (res: http.IncomingMessage) => {
                const { statusCode } = res;
                if (statusCode !== 200) {
                    reject(null)
                }
                res.on('data', (chunk) => {});
                res.on('end', () => {
                    resolve(null);
                });
            });
        });
    }
}

