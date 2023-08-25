'use strict';

const {
    utils: { deployContract },
} = require('@axelar-network/axelar-local-dev');

const HelloWorld = require('../artifacts/HelloWorld.json'); // TODO: Update path

async function preDeploy() {
    // console.log(`Deploying HelloWorld for MultiversX.`);
    // const client = new AptosNetwork(process.env.APTOS_URL);
    // await client.deploy('examples/aptos/call-contract/modules/build/hello_world', ['hello_world.mv']);
    // console.log(`Deployed HelloWorld for MultiversX.`);
}

async function deploy(chain, wallet) {
    console.log(`Deploying HelloWorld for ${chain.name}.`);
    chain.contract = await deployContract(wallet, HelloWorld, [chain.gateway, chain.gasService]);
    console.log(`Deployed HelloWorld for ${chain.name} at ${chain.contract.address}.`);
}

async function execute(chains, wallet, options) {
    const { source, destination, calculateBridgeFee } = options;
    const message = `Hello ${destination.name} from ${source.name}, it is ${new Date().toLocaleTimeString()}.`;

    async function logValue() {
        console.log(`value at ${destination.name} is "${await destination.contract.value()}"`);
    }

    console.log('--- Initially ---');
    await logValue();

    const fee = await calculateBridgeFee(source, destination);

    const tx = await source.contract.setRemoteValue(destination.name, destination.contract.address, message, {
        value: fee,
    });
    await tx.wait();

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    while ((await destination.contract.value()) !== message) {
        await sleep(1000);
    }

    console.log('--- After ---');
    await logValue();
}

module.exports = {
    preDeploy,
    deploy,
    execute,
};
