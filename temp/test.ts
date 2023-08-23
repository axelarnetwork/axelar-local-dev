const { Wallet, ethers } = require('ethers');
const { createAndExport } = require('@axelar-network/axelar-local-dev');
const { EvmRelayer } = require('@axelar-network/axelar-local-dev/dist/relay/EvmRelayer');
const { AptosRelayer } = require('@axelar-network/axelar-local-dev-aptos');
const { createMultiversXNetwork } = require('@axelar-network/axelar-local-dev-multiversx');
const path = require('path');

// Define the path where chain configuration files with deployed contract addresses will be stored
const outputPath = path.resolve(__dirname, '../..', 'chain-config', 'local.json');

const wallet = new Wallet('0x39ee7aeb81c863f98d4929c62620c6bee01bdad16f7b2c860eb6c33d1a521a38');

// A list of addresses to be funded with the native token
const fundAddresses = [wallet.address];

// A callback function that takes a Network object and an info object as parameters
// The info object should look similar to this file: https://github.com/axelarnetwork/axelar-cgp-solidity/blob/main/info/testnet.json.
const callback = (chain: Network, info: any) => {};

// A list of EVM chain names to be initialized
const chains = ["Avalanche", "Ethereum"];

const evmRelayer = new EvmRelayer();
const aptosRelayer = new AptosRelayer();

// Define the chain stacks that the networks will relay transactions between
const relayers = { evm: evmRelayer, aptos: aptosRelayer };

evmRelayer.setRelayer('aptos', relayers.aptos);

// Number of milliseconds to periodically trigger the relay function and send all pending crosschain transactions to the destination chain
const relayInterval = 5000

// A port number for the RPC endpoint. The endpoint for each chain can be accessed by the 0-based index of the chains array.
// For example, if your chains array is ["Avalanche", "Fantom", "Moonbeam"], then http://localhost:8500/0 is the endpoint for the local Avalanche chain.
const port = 8500

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

    // await createAndExport({
    //     chainOutputPath: outputPath,
    //     accountsToFund: fundAddresses,
    //     callback: (chain, _info) => deployAndFundUsdc(chain, fundAddresses),
    //     chains: chains.length !== 0 ? chains : null,
    //     relayInterval: relayInterval,
    //     relayers,
    //     port,
    // });
}

start();
