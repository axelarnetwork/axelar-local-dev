'use strict';

const {
    ethers,
    Wallet,
    Contract,
    ContractFactory,
    providers: {
        Provider
    },
    utils: {
        defaultAbiCoder,
        arrayify,
    },
} = require('ethers');
const {
    getSignedExecuteInput,
    getRandomID,
    deployContract,
  } = require('./utils');
const http = require('http');
const { AxelarGateway } = require('@axelar-network/axelarjs-sdk');

const TokenDeployer = require('../../build/TokenDeployer.json');
const AxelarGatewayProxy = require('../../build/AxelarGatewayProxy.json');
const AxelarGatewaySinglesig = require('../../build/AxelarGatewaySinglesig.json');
const IAxelarGateway = require('../../build/IAxelarGateway.json');
const BurnableMintableCappedERC20 = require('../../build/BurnableMintableCappedERC20.json');
const IAxelarExecutable = require('../../build/IAxelarExecutable.json');

const ROLE_OWNER = 1;
const ROLE_OPERATOR = 2;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

/*
* The Network class
*/
class Network {
    constructor() {
        /** @type {string} */
        this.name;
        /** @type {number} */
        this.chainId;
        /** @type {Provider} */
        this.provider;
        /** @type {[Wallet]} */
        this.userWallets;
        /** @type {Wallet} */
        this.ownerWallet;
        /** @type {Wallet} */
        this.operatorWallet;
        /** @type {Wallet} */
        this.relayerWallet;
        /** @type {[Wallet]} */
        this.adminWallets;
        /** @type {number} */
        this.threshold;
        /** @type {number} */
        this.lastRelayedBlock;
        /** @type {Contract} */
        this.gateway;
        /** @type {Contract} */
        this.ust;
    }
    /**
     * @returns {Contract}
     */
    async _deployGateway() {
        process.stdout.write(`Deploying the Axelar Gateway for ${this.name}... `);
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
        this.gateway = new AxelarGateway(proxy.address, this.provider).getContract();
        /*new Contract(
            proxy.address,
            IAxelarGateway.abi,
            this.provider,
        );*/
        console.log(`Deployed at ${this.gateway.address}`);
        return this.gateway;

    }
    /**
     * @returns {Contract}
     */
    async deployToken (name, symbol, decimals, cap) {
        process.stdout.write(`Deploying ${name} for ${this.name}... `);
        const data = arrayify(defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
                this.chainId,
                ROLE_OWNER,
                [getRandomID()],
                ['deployToken'],
                [defaultAbiCoder.encode(
                    ['string', 'string', 'uint8', 'uint256', 'address'],
                    [name, symbol, decimals, cap, ADDRESS_ZERO],
                )],
            ],
        ));
    
        const tokenFactory = new ContractFactory(
          BurnableMintableCappedERC20.abi,
          BurnableMintableCappedERC20.bytecode,
        );
        const { data: tokenInitCode } = tokenFactory.getDeployTransaction(
          name,
          symbol,
          decimals,
          cap,
        );
    
        const signedData = getSignedExecuteInput(data, this.ownerWallet);
        await this.gateway.connect(this.ownerWallet).execute(signedData);
        let tokenAddress = await this.gateway.tokenAddresses(symbol);
        const tokenContract = new Contract(
            tokenAddress,
            BurnableMintableCappedERC20.abi,
            this.ownerWallet,
        );
        console.log(`Deployed at ${tokenContract.address}`);
        return tokenContract;
    }
    async getTokenContract(symbol) {
        const address = await this.gateway.tokenAddresses(symbol); 
        return new Contract(
            address,
            BurnableMintableCappedERC20.abi,
            this.provider
        );
    }
    async giveToken(address, symbol, amount) {
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

        const signedData = getSignedExecuteInput(data, this.ownerWallet)
        await (await this.gateway.connect(this.ownerWallet).execute(signedData)).wait();
    }
    async relay() {
        if(this._isRemote) {
            await new Promise((resolve, reject) => {
                http.get(this.url + '/relay', (res) => {
                    const { statusCode } = res;
                    if (statusCode !== 200) {
                        reject()
                    } 
                    res.on('data', (chunk) => {});
                    res.on('end', () => {
                        resolve();
                    });
                });
            });
        } else {
            await relay();
        }
    }
    getInfo() {
        const info = {
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
            ustAddress: this.ust.address,
        }
        return info;
    }
}

module.exports = Network
