'use strict';

const {
    ethers,
    Wallet,
    Contract,
    ContractFactory,
    providers: {
        Web3Provider,
        Provider
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
    getLogID,
    defaultAccounts,
  } = require('./utils');
const { deployContract } = require('ethereum-waffle');
const http = require('http');

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ROLE_OWNER = 1;
const ROLE_OPERATOR = 2;



const TokenDeployer = require('../../build/TokenDeployer.json');
const AxelarGatewayProxy = require('../../build/AxelarGatewayProxy.json');
const AxelarGatewaySinglesig = require('../../build/AxelarGatewaySinglesig.json');
const BurnableMintableCappedERC20 = require('../../build/BurnableMintableCappedERC20.json');
const IAxelarExecutable = require('../../build/IAxelarExecutable.json');

//An internal class for handling axelar commands.
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
//A local reference to all the axelar networks created/loaded.
const networks = [];

//This function relays all the messages between the tracked networks.
const relay = async () => {
    const commands = {};
    for(let to of networks) {
        commands[to.name] = [];
    }
    for(const from of networks) {
        let filter = from.gateway.filters.TokenSent();
        let logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
        for(let log of logsFrom) {
            const args = log.args;
            commands[log.args.destinationChain].push(new Command(
                getLogID(log),
                'mintToken', 
                [args.symbol, args.destinationAddress, args.amount], 
                ['string', 'address', 'uint256']
            ));
        }
        filter = from.gateway.filters.ContractCall();
        logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
        for(let log of logsFrom) {
            const args = log.args;
            if(commands[log.args.destinationChain] == null) continue;
            const commandId = getLogID(log);
            commands[log.args.destinationChain].push(new Command(
                commandId,
                'approveContractCall', 
                [from.name, args.sender, args.contractAddress, args.payloadHash], 
                ['string', 'string', 'address', 'bytes32'],
                (async () => {
                    const to = networks.find(chain=>chain.name == args.destinationChain);
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
            const commandId = getLogID(log);
            commands[log.args.destinationChain].push(new Command(
                commandId,
                'approveContractCallWithMint', 
                [from.name, args.sender, args.contractAddress, args.payloadHash, args.symbol, args.amount], 
                ['string', 'string', 'address', 'bytes32', 'string', 'uint256'],
                (async () => {
                    const to = networks.find(chain=>chain.name == args.destinationChain);
                    const contract = new Contract(
                        args.contractAddress,
                        IAxelarExecutable.abi,
                        to.relayerWallet,
                    );
                    await (await contract.executeWithToken(commandId, from.name, args.sender, args.payload, args.symbol, args.amount)).wait();
                }),
            ));
        }
        from.lastRelayedBlock = await from.provider.getBlockNumber();
        
    }

    for(const to of networks) {
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
        const execution = await (await to.gateway.connect(to.ownerWallet).execute(signedData)).wait();
        //console.log(execution);
        for(const command of toExecute) {
            if(command.post == null)
                continue;

            if(!execution.events.find(event=> {
                return event.event == 'Executed' && event.args[0] == command.commandId;
            }))
                continue;
            try {
                await command.post();
            } catch(e) {
                console.log(e);
            }
        }
    }
};

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
        this.gateway = new Contract(
            proxy.address,
            AxelarGatewaySinglesig.abi,
            this.ownerWallet,
        );
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
        await this.gateway.execute(signedData);
        let tokenAddress = await this.gateway.tokenAddresses(symbol);
        const tokenContract = new Contract(
            tokenAddress,
            BurnableMintableCappedERC20.abi,
            this.ownerWallet,
        );
        console.log(`Deployed at ${tokenContract.address}`);
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
        }
        return info;
    }
}

module.exports = {
    Network : Network,
    /**
     * @returns {Network}
     */
    createNetwork: async (options = {}) => {
        const chain = new Network();
        chain.name = options.name != null ? options.name : `Chain ${networks.length+1}`;
        chain.chainId = options.chainId | networks.length+1336;
        console.log(`Creating ${chain.name} with a chainId of ${chain.chainId}...`);
        const accounts = defaultAccounts(20, options.seed);

        const server = require('ganache-core').server( {
            accounts: accounts,
            _chainId: chain.chainId,
            _chainIdRpc: chain.chainId,
        });
        chain.provider = new Web3Provider(server.provider);
        const wallets = accounts.map((x) => new Wallet(x.secretKey, chain.provider));
        chain.userWallets = wallets.splice(10,20);
        [
            chain.ownerWallet,
            chain.operatorWallet,
            chain.relayerWallet,
        ] = wallets;
        chain.adminWallets = wallets.splice(4,10);
        chain.threshold = 3;
        chain.lastRelayedBlock = 0;
        await chain._deployGateway();
        chain.ust = await chain.deployToken('Axelar Wrapped UST', 'UST', 6, 1e12);

        if(options.port) {
            chain.port = options.port;
            server.listen(options.port, err=>{
                if(err)
                    throw err;
                console.log(`Serving ${chain.name} on ${options.port}.`);
            });
            const listener = server.listeners('request')[0];
            server.off('request', listener);
            server.addListener('request', async (req, res) => {
                if(req.method != 'GET') {
                    listener(req, res);
                    return;
                }
                if(req.url == '/axelar') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(chain.getInfo()));
                } else if(req.url == '/relay') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    console.log(`Relaying from ${chain.name}.`);
                    await relay();
                    res.end();
                } else {
                    listener(req, res);
                }
            });
        }
        networks.push(chain);
        return chain;
    },
    /**
     * @returns {Network}
     */
    getNetwork : async (url, info=null) => {
        console.log(`Connecting to remote network at ${url}...`);
        const promise = new Promise((resolve, reject) => {
            const init = async (data) => {
                const chain = new Network();
                chain.name = data.name;
                chain.chainId = data.chainId;
                console.log(`It is ${chain.name} and has a chainId of ${chain.chainId}...`);
                chain.provider = ethers.getDefaultProvider(url);
                chain.userWallets = data.userKeys.map((x) => new Wallet(x, chain.provider));
                chain.ownerWallet = new Wallet(data.ownerKey, chain.provider);
                chain.operatorWallet = new Wallet(data.operatorKey, chain.provider);
                chain.relayerWallet = new Wallet(data.relayerKey, chain.provider);

                chain.adminWallets = data.adminKeys.map((x) => new Wallet(x, chain.provider));
                chain.threshold = data.threshold;
                chain.lastRelayedBlock = data.lastRelayedBlock;

                chain.gateway = new Contract(
                    data.gatewayAddress,
                    AxelarGatewaySinglesig.abi,
                    chain.provider
                );
                const ustAddress = await chain.gateway.tokenAddresses('UST'); 
                chain.ust = new Contract(
                    ustAddress,
                    BurnableMintableCappedERC20.abi,
                    chain.provider
                );

                console.log(`Its gateway is deployed at ${chain.gateway.address} its UST ${chain.ust.address}.`);
                chain._isRemote = true;
                chain.url = url;
                networks.push(chain);
                resolve(chain);
            }
            if(info===null) {
                http.get(url + '/axelar', (res) => {
                    const { statusCode } = res;
                    const contentType = res.headers['content-type'];
                    let error;
                    if (statusCode !== 200) {
                        error = new Error('Request Failed.\n' +
                            `Status Code: ${statusCode}`);
                    } else if (!/^application\/json/.test(contentType)) {
                        error = new Error('Invalid content-type.\n' +
                            `Expected application/json but received ${contentType}`);
                    }
                    if (error) {
                        res.resume();
                        reject(error);
                        return;
                    }
                    res.setEncoding('utf8');
                    let rawData = '';
                    res.on('data', (chunk) => { rawData += chunk; });
                    res.on('end', () => {
                        try {
                            const parsedData = JSON.parse(rawData);
                            init(parsedData);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
            } else {
                init(info);
            }
        });
        return promise;
    },
    /**
     * @returns {Network}
     */
    setupNetwork: async (urlOrProvider, options) => {
        const chain = new Network();
        chain.name = options.name != null ? options.name : `Chain ${networks.length+1}`;
        chain.provider = typeof(urlOrProvider) === 'string' ? ethers.getDefaultProvider(urlOrProvider) : urlOrProvider;
        chain.chainId = (await chain.provider.getNetwork()).chainId;

        console.log(`Setting up ${chain.name} on a network with a chainId of ${chain.chainId}...`);
        if(options.userKeys == null) options.userKeys = [];
        if(options.operatorKey == null) options.operatorKey = options.ownerKey;
        if(options.relayerKey == null) options.relayerKey = options.ownerKey;
        if(options.adminKeys == null) options.adminKeys = [options.ownerKey];

        chain.userWallets = options.userKeys.map((x) => new Wallet(x, chain.provider));
        chain.ownerWallet = new Wallet(options.ownerKey, chain.provider);
        chain.operatorWallet = new Wallet(options.operatorKey, chain.provider);
        chain.relayerWallet = new Wallet(options.relayerKey, chain.provider);

        chain.adminWallets = options.adminKeys.map((x) => new Wallet(x, chain.provider));
        chain.threshold = options.threshold != null ? options.threshold : 1;
        chain.lastRelayedBlock = await chain.provider.getBlockNumber();
        await chain._deployGateway();
        chain.ust = await chain.deployToken('Axelar Wrapped UST', 'UST', 6, 1e12);
        networks.push(chain);
        return chain;
    },
    networks: networks,
    relay: relay,
}