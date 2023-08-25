'use strict';

const {
    utils: { deployContract },
} = require('@axelar-network/axelar-local-dev');
const { loadMultiversXNetwork, updateMultiversXConfig, getMultiversXConfig } = require('@axelar-network/axelar-local-dev-multiversx');

const HelloWorld = require('../artifacts/HelloWorld.json');  // TODO: Update path

const path = require('path');
const { AddressValue } = require('@multiversx/sdk-core/out');

async function preDeploy() {
    console.log(`Deploying HelloWorld for MultiversX.`);
    const client = await loadMultiversXNetwork();

    const contract = path.join(__dirname, 'hello-world/output/hello-world.wasm')

    const contractAddress = await client.deployContract(contract, [
        new AddressValue(client.gatewayAddress),
        new AddressValue(client.gasReceiverAddress),
    ]);
    console.log(`Deployed HelloWorld for MultiversX at ${contractAddress}.`);

    updateMultiversXConfig({ contractAddress });
}

async function deploy(chain, wallet) {
    console.log(`Deploying HelloWorld for ${chain.name}.`);
    chain.contract = await deployContract(wallet, HelloWorld, [chain.gateway, chain.gasService]);
    console.log(`Deployed HelloWorld for ${chain.name} at ${chain.contract.address}.`);
}

async function execute(chains, wallet, options) {
    // const { source, destination, calculateBridgeFee } = options;
    const { destination } = options;

    const client = await loadMultiversXNetwork();

    const message = `Hello ${destination.name} from MultiversX, it is ${new Date().toLocaleTimeString()}.`;

    async function logValue() {
        console.log(`value at ${destination.name} is "${await destination.contract.value()}"`);

        const contractAddress = getMultiversXConfig()?.contractAddress;

        if (!contractAddress) {
            throw new Error('Deploy MultiversX contract before running this!')
        }

        const result = await client.callContract(contractAddress, "received_value");

        console.log(`Value at MultiversX is `, result);
    }

    console.log('--- Initially ---');
    await logValue();
    //
    // const fee = await calculateBridgeFee(source, destination);
    //
    // const tx = await source.contract.setRemoteValue(destination.name, destination.contract.address, message, {
    //     value: fee,
    // });
    // await tx.wait();
    //
    // const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    //
    // while ((await destination.contract.value()) !== message) {
    //     await sleep(1000);
    // }
    //
    // console.log('--- After ---');
    // await logValue();
}

module.exports = {
    preDeploy,
    deploy,
    execute,
};
