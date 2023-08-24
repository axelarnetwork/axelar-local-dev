'use strict';

const {
    utils: { deployContract },
} = require('@axelar-network/axelar-local-dev');

const HelloWorld = require('../artifacts/HelloWorld.json'); // TODO: Update path

async function preDeploy() {
    console.log(`Deploying HelloWorld for MultiversX.`);
    // const client = new AptosNetwork(process.env.APTOS_URL);
    // await client.deploy('examples/aptos/call-contract/modules/build/hello_world', ['hello_world.mv']);
    console.log(`Deployed HelloWorld for MultiversX.`);
}

async function deploy(chain, wallet) {
    console.log(`Deploying HelloWorld for ${chain.name}.`);
    chain.contract = await deployContract(wallet, HelloWorld, [chain.gateway, chain.gasService]);
    console.log(`Deployed HelloWorld for ${chain.name} at ${chain.contract.address}.`);
}

async function execute(evmChain, wallet, options) {
    console.log('TODO');
}

module.exports = {
    preDeploy,
    deploy,
    execute,
};
