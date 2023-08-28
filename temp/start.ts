import { chains, wallet } from './utils';

const { ethers } = require('ethers');
const { createAndExport, Network } = require('@axelar-network/axelar-local-dev');
const { EvmRelayer } = require('@axelar-network/axelar-local-dev/dist/relay/EvmRelayer');
const { createMultiversXNetwork, MultiversXRelayer } = require('@axelar-network/axelar-local-dev-multiversx');
const path = require('path');

// Define the path where chain configuration files with deployed contract addresses will be stored
const outputPath = path.resolve(__dirname, '../..', 'chain-config', 'local.json');

// A list of addresses to be funded with the native token
const fundAddresses = [wallet.address];

const evmRelayer = new EvmRelayer();
const multiversXRelayer = new MultiversXRelayer();

// Define the chain stacks that the networks will relay transactions between
const relayers = { evm: evmRelayer, multiversx: multiversXRelayer };

evmRelayer.setRelayer('multiversx', relayers.multiversx);

// Number of milliseconds to periodically trigger the relay function and send all pending crosschain transactions to the destination chain
const relayInterval = 6000;

// A port number for the RPC endpoint. The endpoint for each chain can be accessed by the 0-based index of the chains array.
// For example, if your chains array is ["Avalanche", "Fantom", "Moonbeam"], then http://localhost:8500/0 is the endpoint for the local Avalanche chain.
const port = 8500;

async function deployAndFundUsdc(chain, toFund) {
    await chain.deployToken('Axelar Wrapped aUSDC', 'aUSDC', 6, ethers.utils.parseEther('1000'));

    for (const address of toFund) {
        await chain.giveToken(address, 'aUSDC', ethers.utils.parseEther('1'));
    }
}

const start = async () => {
    await createMultiversXNetwork({
        gatewayUrl: 'http://0.0.0.0:7950',
    });

    await createAndExport({
        chainOutputPath: outputPath,
        accountsToFund: fundAddresses,
        callback: (chain: Network, info: any) => deployAndFundUsdc(chain, fundAddresses),
        chains: chains.length !== 0 ? chains : null,
        relayInterval: relayInterval,
        relayers,
        port,
    });
}

start();
