'use strict';

import {
    ethers,
    Wallet,
    Contract,
    providers,
} from 'ethers';
const {
    defaultAbiCoder,
    arrayify,
} = ethers.utils; 
import {
    getSignedExecuteInput,
    getRandomID,
    getLogID,
    defaultAccounts,
    setJSON,
    httpGet,
  } from './utils';
import server from './server';
import { Network, networks, NetworkOptions, NetworkInfo, NetworkSetup }  from './Network';

const ROLE_OWNER = 1;
const ROLE_OPERATOR = 2;
const fs = require('fs');

var fullfill = true;
const IAxelarGateway = require('../build/IAxelarGateway.json');
const IAxelarExecutable = require('../build/IAxelarExecutable.json');

//An internal class for handling axelar commands.
class Command {
    commandId: string;
    name: string;
    data: any[];
    encodedData: string;
    post: (() => Promise<void>) | undefined;
    constructor(commandId: string, name: string, data: any[], dataSignature: string[], post: (() => Promise<void>) | undefined = undefined) {
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

//This function relays all the messages between the tracked networks.
export const relay = async () => {
    const commands: {[key: string]: Command[]} = {};
    for(let to of networks) {
        commands[to.name] = [];
    }

    for(const from of networks) {
        let filter = from.gateway.filters.TokenSent();
        let logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
        for(let log of logsFrom) {
            const args:any = log.args;
            commands[args.destinationChain].push(new Command(
                getLogID(log),
                'mintToken', 
                [args.symbol, args.destinationAddress, args.amount], 
                ['string', 'address', 'uint256']
            ));
        }
        filter = from.gateway.filters.ContractCall();
        logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
        for(let log of logsFrom) {
            const args: any = log.args;
            if(commands[args.destinationChain] == null) continue;
            const commandId = getLogID(log);
            commands[args.destinationChain].push(new Command(
                commandId,
                'approveContractCall', 
                [from.name, args.sender, args.destinationContractAddress, args.payloadHash], 
                ['string', 'string', 'address', 'bytes32'],
                (async () => {
                    const to = networks.find(chain=>chain.name == args.destinationChain);
                    const contract = new Contract(
                        args.destinationContractAddress,
                        IAxelarExecutable.abi,
                        to!.relayerWallet,
                    );
                    await (await contract.execute(commandId, from.name, args.sender, args.payload)).wait();
                }),
            ));
        }
        filter = from.gateway.filters.ContractCallWithToken();
        logsFrom = await from.gateway.queryFilter(filter, from.lastRelayedBlock+1);
        for(let log of logsFrom) {
            const args: any = log.args;
            const commandId = getLogID(log);
            commands[args.destinationChain].push(new Command(
                commandId,
                'approveContractCallWithMint', 
                [from.name, args.sender, args.destinationContractAddress, args.payloadHash, args.symbol, args.amount], 
                ['string', 'string', 'address', 'bytes32', 'string', 'uint256'],
                (async () => {
                    const to = networks.find(chain=>chain.name == args.destinationChain);
                    const contract = new Contract(
                        args.destinationContractAddress,
                        IAxelarExecutable.abi,
                        to!.relayerWallet,
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
        if(!fullfill) continue;
        for(const command of toExecute) {
            if(command.post == null)
                continue;

            if(!execution.events.find((event:any)=> {
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


function listen(port: number, callback: (() => void) | undefined = undefined) {
    if(!callback) 
        callback = () => {
            console.log(`Serving ${networks.length} networks on port ${port}`)
        }
    return server(networks).listen(port, callback);
}
/**
 * @returns {Network}
 */
async function createNetwork(options: NetworkOptions = {
    dbPath: undefined,
    ganacheOptions: undefined,
    port: undefined,
    name: undefined,
    chainId: undefined,
    seed: undefined,
}) {
    if(options.dbPath && fs.existsSync(options.dbPath + '/networkInfo.json')) {
        console.log('this exists!');
        const info = require(options.dbPath + '/networkInfo.json');
        const ganacheProvider = require('ganache').provider( {
            database: {dbPath : options.dbPath},
            ...options.ganacheOptions,
            chain: { 
                chainId: info.chainId,
                netwrokId: info.chainId,
            },
            logging: { quiet: true },
        });
        const chain = await getNetwork(new providers.Web3Provider(ganacheProvider), info);
        chain.ganacheProvider = ganacheProvider;
        if(options.port) {
            chain.port = options.port;
            chain.server = server(chain).listen(chain.port, () => {
                console.log(`Serving ${chain.name} on port ${chain.port}`)
            });
        }
        return chain;
    }
    const chain: Network = new Network();
    chain.name = options.name != null ? options.name : `Chain ${networks.length+1}`;
    chain.chainId = options.chainId! | networks.length+2500;
    console.log(`Creating ${chain.name} with a chainId of ${chain.chainId}...`);
    const accounts = defaultAccounts(20, options.seed!);
    
    chain.ganacheProvider = require('ganache').provider( {
        database: {dbPath : options.dbPath},
        ...options.ganacheOptions,
        wallet: {
            accounts: accounts,
        },
        chain: { 
            chainId: chain.chainId,
            netwrokId: chain.chainId,
        },
        logging: { quiet: true },
    });
    chain.provider = new providers.Web3Provider(chain.ganacheProvider);
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
    chain.ust = await chain.deployToken('Axelar Wrapped UST', 'UST', 6, BigInt(1e70));

    if(options.port) {
        chain.port = options.port;
        chain.server = server(chain).listen(chain.port, () => {
            console.log(`Serving ${chain.name} on port ${chain.port}`)
        });
    }
    if(options.dbPath) {
        setJSON(chain.getInfo(), options.dbPath + '/networkInfo.json');
    }
    networks.push(chain);
    return chain;
}

/**
 * @returns {Network}
 */
async function getNetwork(urlOrProvider: string | providers.Provider, info: NetworkInfo | undefined=undefined) {

    if(!info) 
        info = await httpGet(urlOrProvider + '/info') as NetworkInfo;
    const chain: Network = new Network();
    chain.name = info.name;
    chain.chainId = info.chainId;
    console.log(`It is ${chain.name} and has a chainId of ${chain.chainId}...`);

    if(typeof(urlOrProvider) == 'string') {
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

    chain.gateway = new Contract(
        info.gatewayAddress,
        IAxelarGateway.abi,
        chain.provider
    );
    chain.ust = await chain.getTokenContract('UST');

    console.log(`Its gateway is deployed at ${chain.gateway.address} its UST ${chain.ust.address}.`);
    
    networks.push(chain);
    return chain;
}


/**
 * @returns {[Network]}
 */
 async function getAllNetworks(url: string) {
    const n: number = parseInt(await httpGet(url + '/info') as string);
    for(let i=0;i<n;i++) {
        await getNetwork(url+'/'+i);
    }
    return networks;
}

/**
 * @returns {Network}
 */
async function setupNetwork (urlOrProvider: string | providers.Provider, options: NetworkSetup) {
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
    chain.ust = await chain.deployToken('Axelar Wrapped UST', 'UST', 6, BigInt(1e70));
    networks.push(chain);
    return chain;
}

async function stop(network: string | Network){
    if(typeof(network) == 'string')
        network = networks.find(chain => chain.name == network)!;
    if(network.server != null)
        await network.server.close();
    networks.splice(networks.indexOf(network), 1);
}


async function stopAll() {
    while(networks.length > 0) {
        await stop(networks[0]);
    }
}


module.exports = {
    networks: networks,
    createNetwork,
    listen,
    getNetwork,
    getAllNetworks,
    setupNetwork,
    relay,
    stop,
    stopAll, 
    fullfill,
}
