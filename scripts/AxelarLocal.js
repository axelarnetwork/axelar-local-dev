'use strict';

const {
    Wallet,
    Contract,
    ContractFactory,
    providers: {
        Web3Provider
    },
    utils: {
        defaultAbiCoder,
        arrayify,
        keccak256,
    },
} = require('ethers');
const {
    getSignedExecuteInput,
    getRandomID,
  } = require('./utils');
const { deployContract } = require('ethereum-waffle');

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ROLE_OWNER = 1;
const ROLE_OPERATOR = 2;



const TokenDeployer = require('../build/TokenDeployer.json');
const AxelarGatewayProxy = require('../build/AxelarGatewayProxy.json');
const AxelarGatewaySinglesig = require('../build/AxelarGatewaySinglesig.json');
const BurnableMintableCappedERC20 = require('../build/BurnableMintableCappedERC20.json');
const MintableCappedERC20 = require('../build/MintableCappedERC20.json');
const DepositHandler = require('../build/DepositHandler.json');
const IAxelarExecutable = require('../build/IAxelarExecutable.json');


class Command {
    constructor(commandId, name, data, dataSignature, post=null) {
        this.commandId = commandId;
        this.name = name;
        this.data = data;
        this.encodedData = defaultAbiCoder.encode(
            dataSignature,
            data,
        )
        this.post = post;
    }
}

const chains = [];

const defaultAccounts = (n) => {
    const balance = '10000000000000000000000000000000000';
    const privateKeys = [];
    let key = '0x29f3edee0ad3abf8e2699402e0e28cd6492c9be7eaab00d732a791c33552f797';
    for(let i=0;i<n;i++) {
        key = keccak256(key);
        privateKeys.push(key);
    }
    return privateKeys.map(secretKey => ({ balance, secretKey }));
}

class Chain {
    constructor(name='', chainId=-1) {
        this.name = name === '' ? `Chain ${chains.length+1}` : name;
        this.chainId = chainId === -1 ? chains.length+1 : chainId;
        const accounts = defaultAccounts(20);
        this.provider = new Web3Provider(require('ganache-core').provider({
            accounts: accounts,
            _chainId: this.chainId,
        }));
        const wallets = accounts.map((x) => new Wallet(x.secretKey, this.provider));
        this.userWallets = wallets.splice(10,20);
        [
            this.ownerWallet,
            this.operatorWallet,
            this.relayerWallet,
        ] = wallets;
        this.adminWallets = wallets.splice(4,10);
        this.threshold = 3;
        this.lastRelayedBlock = 0;
        this.ust = null;
        this.gateway = null;
    }
    async deployGateway() {
        const params = arrayify(
            defaultAbiCoder.encode(
            ['address[]', 'uint8', 'address', 'address'],
            [
                this.adminWallets.map(wallet => wallet.address),
                this.threshold,
                this.ownerWallet.address,
                this.operatorWallet.address,
            ],
            ),
        );
        let tokenDeployer = await deployContract(this.ownerWallet, TokenDeployer);
        const gateway = await deployContract(this.ownerWallet, AxelarGatewaySinglesig, [
            tokenDeployer.address,
        ]);
        const proxy = await deployContract(this.ownerWallet, AxelarGatewayProxy, [
            gateway.address,
            params,
        ]);
        let contract = new Contract(
            proxy.address,
            AxelarGatewaySinglesig.abi,
            this.ownerWallet,
        );
        return contract;
    }
    async deployToken (name, symbol, decimals, cap) {
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
        await this.gateway.execute(signedData);
        let tokenAddress = await this.gateway.tokenAddresses(symbol);
        const tokenContract = new Contract(
            tokenAddress,
            BurnableMintableCappedERC20.abi,
            this.ownerWallet,
        );
        return tokenContract;
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
        await (await this.gateway.execute(signedData)).wait();
    }
}

module.exports = {
    createChain: async (name='', chainId=-1) => {
        const chain = new Chain(name, chainId);
        chain.gateway = await chain.deployGateway();
        chain.ust = await chain.deployToken('Axelar Wrapped UST', 'UST', 6, 1e12);
        chains.push(chain);
        return chain;
    },
    chains: chains,
    relay: async () => {
        const commands = {};
        for(let to of chains) {
            commands[to.name] = [];
        }
        for(const from of chains) {
            let filter = from.gateway.filters.TokenSent();
            let logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
            for(let log of logsFrom) {
                const args = log.args;
                commands[log.args.destinationChain].push(new Command(
                    getRandomID(),
                    'mintToken', 
                    [args.symbol, args.destinationAddress, args.amount], 
                    ['string', 'address', 'uint256']
                ));
            }
            filter = from.gateway.filters.ContractCall();
            logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
            for(let log of logsFrom) {
                const args = log.args;
                const commandId = getRandomID();
                commands[log.args.destinationChain].push(new Command(
                    commandId,
                    'approveContractCall', 
                    [from.name, args.sender, args.contractAddress, args.payloadHash], 
                    ['string', 'string', 'address', 'bytes32'],
                    (async () => {
                        const to = chains.find(chain=>chain.name == args.destinationChain);
                        const contract = new Contract(
                            args.contractAddress,
                            IAxelarExecutable.abi,
                            to.relayerWallet,
                        );
                        await (await contract.execute(commandId, from.name, args.sender, args.payload)).wait();
                    }),
                ));
            }
            filter = from.gateway.filters.ContractCallWithToken();
            logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
            for(let log of logsFrom) {
                const args = log.args;
                const commandId = getRandomID();
                commands[log.args.destinationChain].push(new Command(
                    commandId,
                    'approveContractCallWithMint', 
                    [from.name, args.sender, args.contractAddress, args.payloadHash, args.symbol, args.amount], 
                    ['string', 'string', 'address', 'bytes32', 'string', 'uint256'],
                    (async () => {
                        const to = chains.find(chain=>chain.name == args.destinationChain);
                        const contract = new Contract(
                            args.contractAddress,
                            IAxelarExecutable.abi,
                            to.relayerWallet,
                        );
                        await (await contract.executeWithMint(commandId, from.name, args.sender, args.payload, args.symbol, args.amount)).wait();
                    }),
                ));
            }
            from.lastRelayedBlock = await from.provider.getBlockNumber();
            
        }

        for(const to of chains) {
            const toExecute = commands[to.name];
            if(toExecute.length == 0) continue;
            const data = arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        to.chainId,
                        ROLE_OWNER,
                        toExecute.map(com=>com.commandId),
                        toExecute.map(com=>com.name),
                        toExecute.map(com=>com.encodedData),
                    ],
                ),
            );
            const signedData = getSignedExecuteInput(data, to.ownerWallet);
            await (await to.gateway.connect(to.ownerWallet).execute(signedData)).wait();
            for(const command of toExecute) {
                if(command.post == null)
                    continue;
                await command.post();
            }
        }
    },
}